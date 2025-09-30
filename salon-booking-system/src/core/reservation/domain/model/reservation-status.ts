export enum ReservationStatusType {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
  COMPLETED = 'COMPLETED',
  NO_SHOW = 'NO_SHOW'
}

export class ReservationStatus {
  private readonly status: ReservationStatusType;
  private readonly changedAt: Date;
  private readonly reason?: string;

  constructor(status: ReservationStatusType, changedAt?: Date, reason?: string) {
    this.status = status;
    this.changedAt = changedAt || new Date();
    this.reason = reason;
  }

  static pending(): ReservationStatus {
    return new ReservationStatus(ReservationStatusType.PENDING);
  }

  static confirmed(): ReservationStatus {
    return new ReservationStatus(ReservationStatusType.CONFIRMED);
  }

  static cancelled(reason: string): ReservationStatus {
    return new ReservationStatus(ReservationStatusType.CANCELLED, new Date(), reason);
  }

  static completed(): ReservationStatus {
    return new ReservationStatus(ReservationStatusType.COMPLETED);
  }

  static noShow(): ReservationStatus {
    return new ReservationStatus(ReservationStatusType.NO_SHOW);
  }

  canTransitionTo(newStatus: ReservationStatusType): boolean {
    const transitions: Record<ReservationStatusType, ReservationStatusType[]> = {
      [ReservationStatusType.PENDING]: [
        ReservationStatusType.CONFIRMED,
        ReservationStatusType.CANCELLED
      ],
      [ReservationStatusType.CONFIRMED]: [
        ReservationStatusType.CANCELLED,
        ReservationStatusType.COMPLETED,
        ReservationStatusType.NO_SHOW
      ],
      [ReservationStatusType.CANCELLED]: [],
      [ReservationStatusType.COMPLETED]: [],
      [ReservationStatusType.NO_SHOW]: []
    };

    return transitions[this.status].includes(newStatus);
  }

  transitionTo(newStatus: ReservationStatusType, reason?: string): ReservationStatus {
    if (!this.canTransitionTo(newStatus)) {
      throw new Error(`Cannot transition from ${this.status} to ${newStatus}`);
    }

    return new ReservationStatus(newStatus, new Date(), reason);
  }

  isPending(): boolean {
    return this.status === ReservationStatusType.PENDING;
  }

  isConfirmed(): boolean {
    return this.status === ReservationStatusType.CONFIRMED;
  }

  isCancelled(): boolean {
    return this.status === ReservationStatusType.CANCELLED;
  }

  isCompleted(): boolean {
    return this.status === ReservationStatusType.COMPLETED;
  }

  isNoShow(): boolean {
    return this.status === ReservationStatusType.NO_SHOW;
  }

  isFinal(): boolean {
    return this.isCancelled() || this.isCompleted() || this.isNoShow();
  }

  getStatus(): ReservationStatusType {
    return this.status;
  }

  getChangedAt(): Date {
    return new Date(this.changedAt);
  }

  getReason(): string | undefined {
    return this.reason;
  }

  equals(other: ReservationStatus): boolean {
    return this.status === other.status;
  }

  toString(): string {
    return this.status;
  }
}