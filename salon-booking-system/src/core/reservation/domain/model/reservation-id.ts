export class ReservationId {
  private readonly value: string;

  constructor(value: string) {
    if (!value) {
      throw new Error('ReservationId cannot be empty');
    }

    if (!this.isValidFormat(value)) {
      throw new Error('Invalid ReservationId format');
    }

    this.value = value;
  }

  private isValidFormat(value: string): boolean {
    // Format: RESV-YYYYMMDD-XXXX (e.g., RESV-20240315-0001)
    const pattern = /^RESV-\d{8}-\d{4}$/;
    return pattern.test(value);
  }

  static generate(): ReservationId {
    const date = new Date();
    const dateStr = date.getFullYear().toString() +
                   (date.getMonth() + 1).toString().padStart(2, '0') +
                   date.getDate().toString().padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return new ReservationId(`RESV-${dateStr}-${random}`);
  }

  getValue(): string {
    return this.value;
  }

  equals(other: ReservationId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}