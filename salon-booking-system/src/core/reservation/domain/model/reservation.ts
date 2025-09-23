// 予約というビジネス上の概念を表現してみる

// まずオブジェクトが持つべきプロパティ（属性）を定義したインターフェースを作成する
// 予約の振る舞いとデータをカプセル化（隠蔽）するクラスを作成する

// 作成するものの内容
// エンティティ
// 値オブジェクト
// カプセル化
// ドメインルールの内包


import { ReservationId } from './reservation-id';
import { TimeSlot } from './time-slop';
import { ReservationStatus, ReservationStatusType } from './reservation-status';
import {
  CannotConfirmReservationError,
  CannotCancelReservationError,
  CannotCompleteReservationError,
  CannotMarkNoShowError,
  CannotRescheduleReservationError,
  CannotReassignStaffError,
  InvalidStaffIdError,
  PastTimeReservationError,
} from '../errors';

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
      throw new PastTimeReservationError();
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
      throw new CannotConfirmReservationError(this.status.getStatus());
    }
  
    this.status = this.status.transitionTo(ReservationStatusType.CONFIRMED);
    this.updatedAt = new Date();
  }
  
  cancel(reason: string): void {
    if (this.status.isFinal()) {
      throw new CannotCancelReservationError('reservation is in final status');
    }
  
    if (!this.status.canTransitionTo(ReservationStatusType.CANCELLED)) {
      throw new CannotCancelReservationError(this.status.getStatus());
    }
  
    this.status = this.status.transitionTo(ReservationStatusType.CANCELLED, reason);
    this.updatedAt = new Date();
  }
  
  complete(): void {
    if (!this.status.isConfirmed()) {
      throw new CannotCompleteReservationError('only confirmed reservations can be completed');
    }
  
    const now = new Date();
    if (this.timeSlot.getEndTime() > now) {
      throw new CannotCompleteReservationError('cannot complete before end time');
    }
  
    this.status = this.status.transitionTo(ReservationStatusType.COMPLETED);
    this.updatedAt = new Date();
  }
  
  markNoShow(): void {
    if (!this.status.isConfirmed()) {
      throw new CannotMarkNoShowError('only confirmed reservations can be marked as no-show');
    }
  
    const now = new Date();
    if (this.timeSlot.getStartTime() > now) {
      throw new CannotMarkNoShowError('cannot mark as no-show before reservation time');
    }
  
    this.status = this.status.transitionTo(ReservationStatusType.NO_SHOW);
    this.updatedAt = new Date();
  }
  
  reschedule(newTimeSlot: TimeSlot): void {
    if (this.status.isFinal()) {
      throw new CannotRescheduleReservationError('reservation is in final status');
    }
  
    const now = new Date();
    if (newTimeSlot.getStartTime() <= now) {
      throw new CannotRescheduleReservationError('cannot reschedule to past time');
    }
  
    this.timeSlot = newTimeSlot;
    this.updatedAt = new Date();
  }
  
  reassignStaff(newStaffId: string): void {
    if (this.status.isFinal()) {
      throw new CannotReassignStaffError('reservation is in final status');
    }
  
    if (!newStaffId) {
      throw new InvalidStaffIdError();
    }
  
    this.staffId = newStaffId;
    this.updatedAt = new Date();
  }

  private validateStaffId(newStaffId: string): void {
    if (!newStaffId) {
      throw new InvalidStaffIdError();
    }
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