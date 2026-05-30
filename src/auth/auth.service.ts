import { Injectable, UnauthorizedException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword, verifyPassword } from '../common/utils/password.util';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { EnableMFADto, MFAType } from './dto/enable-mfa.dto';
import { MFAUtil } from './utils/mfa.util';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async register(registerDto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: registerDto.email },
    });

    if (existingUser) {
      throw new ConflictException('User already exists with this email');
    }

    const hashedPassword = await hashPassword(registerDto.password);

    const user = await this.prisma.user.create({
      data: {
        email: registerDto.email,
        name: registerDto.name,
        phone: registerDto.phone,
        role: (registerDto.role || 'USER') as any,
        password: hashedPassword,
        isActive: true,
        mfaEnabled: false,
        emailVerified: false,
        phoneVerified: false,
        mfaBackupCodes: [] as any,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });

    const token = this.generateToken({
      userId: user.id,
      email: user.email,
      role: String(user.role),
    });

    return {
      success: true,
      message: 'User created successfully',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      token,
    };
  }

  async login(loginDto: LoginDto, mfaCode?: string) {
    const rawInput = loginDto.email;
    const email = rawInput.includes('@') ? rawInput : `${rawInput}@stefanos.com`;

    const user = await this.prisma.user.findFirst({
      where: rawInput.includes('@')
        ? { email }
        : { OR: [{ email }, { name: rawInput }] },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.password) {
      const isValidPassword = await verifyPassword(loginDto.password, user.password);
      if (!isValidPassword) {
        throw new UnauthorizedException('Invalid credentials');
      }
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    if (user.mfaEnabled) {
      if (!mfaCode) {
        return {
          success: false,
          requiresMFA: true,
          mfaType: user.mfaSecret ? MFAType.TOTP : MFAType.EMAIL,
          message: 'MFA code required',
        };
      }

      const isValidMFA = await this.verifyMFACode(user, mfaCode);
      if (!isValidMFA) {
        throw new UnauthorizedException('Invalid MFA code');
      }
    }

    const token = this.generateToken({
      userId: user.id,
      email: user.email,
      role: String(user.role),
    });

    return {
      success: true,
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        mfaEnabled: user.mfaEnabled,
      },
      token,
    };
  }

  async enableMFA(userId: string, enableMFADto: EnableMFADto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (enableMFADto.type === MFAType.TOTP) {
      const { secret, qrCodeUrl } = MFAUtil.generateTOTPSecret(user.email);
      const backupCodes = MFAUtil.generateBackupCodes();

      await this.prisma.user.update({
        where: { id: userId },
        data: {
          mfaEnabled: true,
          mfaSecret: secret,
          mfaBackupCodes: backupCodes as any,
        },
      });

      return {
        success: true,
        message: 'TOTP MFA enabled',
        qrCodeUrl,
        backupCodes,
        secret,
      };
    }

    if (enableMFADto.type === MFAType.EMAIL) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          mfaEnabled: true,
          emailVerified: true,
        },
      });

      return {
        success: true,
        message: 'Email MFA enabled. OTP will be sent to your email on login.',
      };
    }

    throw new BadRequestException('Invalid MFA type');
  }

  async disableMFA(userId: string) {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { mfaEnabled: false, mfaSecret: null, mfaBackupCodes: [] as any },
      });
    } catch (e: any) {
      if (e?.code === 'P2025') throw new UnauthorizedException('User not found');
      throw e;
    }

    return { success: true, message: 'MFA disabled' };
  }

  async verifyMFACode(user: any, code: string): Promise<boolean> {
    if (user.mfaSecret) {
      return MFAUtil.verifyTOTP(user.mfaSecret, code);
    }

    return MFAUtil.verifyEmailOTP(user.id, code);
  }

  async sendEmailOTP(userId: string): Promise<{ success: boolean; message: string }> {
    if (!userId) {
      throw new BadRequestException('userId is required');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
      },
    });

    if (!user || !user.email) {
      throw new BadRequestException('User email not found');
    }

    const otp = MFAUtil.generateEmailOTP();
    await MFAUtil.storeOTP(user.id, otp);

    // TODO: Replace with real email provider integration.
    this.logger.debug(`Email OTP for ${user.email}: ${otp}`);

    return {
      success: true,
      message: 'OTP sent to email',
    };
  }

  async getCurrentUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        avatar: true,
        isActive: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return {
      success: true,
      user,
    };
  }

  private generateToken(payload: { userId: string; email: string; role: string }): string {
    const expiresIn = this.configService.get<string>('JWT_EXPIRES_IN') || '7d';
    return this.jwtService.sign(payload, {
      expiresIn: expiresIn as any,
    });
  }
}

