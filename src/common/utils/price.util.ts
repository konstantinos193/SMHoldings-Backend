export function computeNightlySubtotal(
  basePrice: number,
  rules: Array<{ startDate: Date | string; endDate: Date | string; priceOverride?: number | null }>,
  checkIn: Date,
  checkOut: Date,
): { subtotal: number; nights: number } {
  let subtotal = 0;
  let nights = 0;
  const current = new Date(checkIn);
  current.setHours(0, 0, 0, 0);
  const end = new Date(checkOut);
  end.setHours(0, 0, 0, 0);

  while (current < end) {
    const rule = rules.find(
      (r) => new Date(r.startDate) <= current && new Date(r.endDate) > current,
    );
    subtotal += rule?.priceOverride ?? basePrice;
    nights++;
    current.setDate(current.getDate() + 1);
  }

  return { subtotal, nights };
}

export const formatPrice = (price: number, currency: string = 'EUR'): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
  }).format(price);
};

export const calculateTotalPrice = (
  basePrice: number,
  cleaningFee: number = 0,
  serviceFee: number = 0,
  taxes: number = 0,
  nights: number = 1,
): number => {
  return basePrice * nights + cleaningFee + serviceFee + taxes;
};

