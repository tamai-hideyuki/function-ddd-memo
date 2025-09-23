import { ReservationId } from './reservation-id';
import { TimeSlot } from './time-slop';
import { ReservationStatus, ReservationStatusType } from './reservation-status';

export interface ReservationProps {
  id: ReservationId;
  customerId: string;
  staffId: string;
  serviceId: string;
  timeSlot: TimeSlot;
  status: ReservationStatus;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class Reservation {
  private readonly id: ReservationId;
  private customerId: string;
  private staffId: string;
  private serviceId: string;
  private timeSlot: TimeSlot;
  private status: ReservationStatus;
  private notes?: string;
  private readonly createdAt: Date;
  private updatedAt: Date;

  constructor(props: ReservationProps) {
    this.id = props.id;
    this.customerId = props.customerId;
    this.staffId = props.staffId;
    this.serviceId = props.serviceId;
    this.timeSlot = props.timeSlot;
    this.status = props.status;
    this.notes = props.notes;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(
    customerId: string,
    staffId: string,
    serviceId: string,
    timeSlot: TimeSlot,
    notes?: string
  ): Reservation {
    const now = new Date();

    if (timeSlot.getStartTime() <= now) {
      throw new Error('Cannot create reservation for past time');
    }

    return new Reservation({
      id: ReservationId.generate(),
      customerId,
      staffId,
      serviceId,
      timeSlot,
      status: ReservationStatus.pending(),
      notes,
      createdAt: now,
      updatedAt: now
    });
  }

  confirm(): void {
    if (!this.status.canTransitionTo(ReservationStatusType.CONFIRMED)) {
      throw new Error('Cannot confirm reservation in current status');
    }

    this.status = this.status.transitionTo(ReservationStatusType.CONFIRMED);
    this.updatedAt = new Date();
  }

  cancel(reason: string): void {
    if (this.status.isFinal()) {
      throw new Error('Cannot cancel reservation in final status');
    }

    if (!this.status.canTransitionTo(ReservationStatusType.CANCELLED)) {
      throw new Error('Cannot cancel reservation in current status');
    }

    this.status = this.status.transitionTo(ReservationStatusType.CANCELLED, reason);
    this.updatedAt = new Date();
  }

  complete(): void {
    if (!this.status.isConfirmed()) {
      throw new Error('Only confirmed reservations can be completed');
    }

    const now = new Date();
    if (this.timeSlot.getEndTime() > now) {
      throw new Error('Cannot complete reservation before end time');
    }

    this.status = this.status.transitionTo(ReservationStatusType.COMPLETED);
    this.updatedAt = new Date();
  }

  markNoShow(): void {
    if (!this.status.isConfirmed()) {
      throw new Error('Only confirmed reservations can be marked as no-show');
    }

    const now = new Date();
    if (this.timeSlot.getStartTime() > now) {
      throw new Error('Cannot mark as no-show before reservation time');
    }

    this.status = this.status.transitionTo(ReservationStatusType.NO_SHOW);
    this.updatedAt = new Date();
  }

  reschedule(newTimeSlot: TimeSlot): void {
    if (this.status.isFinal()) {
      throw new Error('Cannot reschedule reservation in final status');
    }

    const now = new Date();
    if (newTimeSlot.getStartTime() <= now) {
      throw new Error('Cannot reschedule to past time');
    }

    this.timeSlot = newTimeSlot;
    this.updatedAt = new Date();
  }

  reassignStaff(newStaffId: string): void {
    if (this.status.isFinal()) {
      throw new Error('Cannot reassign staff for reservation in final status');
    }

    if (!newStaffId) {
      throw new Error('Staff ID cannot be empty');
    }

    this.staffId = newStaffId;
    this.updatedAt = new Date();
  }

  updateNotes(notes: string): void {
    this.notes = notes;
    this.updatedAt = new Date();
  }

  getId(): ReservationId {
    return this.id;
  }

  getCustomerId(): string {
    return this.customerId;
  }

  getStaffId(): string {
    return this.staffId;
  }

  getServiceId(): string {
    return this.serviceId;
  }

  getTimeSlot(): TimeSlot {
    return this.timeSlot;
  }

  getStatus(): ReservationStatus {
    return this.status;
  }

  getNotes(): string | undefined {
    return this.notes;
  }

  getCreatedAt(): Date {
    return new Date(this.createdAt);
  }

  getUpdatedAt(): Date {
    return new Date(this.updatedAt);
  }

  isPending(): boolean {
    return this.status.isPending();
  }

  isConfirmed(): boolean {
    return this.status.isConfirmed();
  }

  isCancelled(): boolean {
    return this.status.isCancelled();
  }

  isCompleted(): boolean {
    return this.status.isCompleted();
  }

  isNoShow(): boolean {
    return this.status.isNoShow();
  }

  isActive(): boolean {
    return !this.status.isFinal();
  }

  toJSON(): object {
    return {
      id: this.id.toString(),
      customerId: this.customerId,
      staffId: this.staffId,
      serviceId: this.serviceId,
      timeSlot: {
        startTime: this.timeSlot.getStartTime().toISOString(),
        endTime: this.timeSlot.getEndTime().toISOString()
      },
      status: this.status.getStatus(),
      notes: this.notes,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString()
    };
  }
}