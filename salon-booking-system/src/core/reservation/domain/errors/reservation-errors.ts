// 基本的な Error Classes
export abstract class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 400
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}


// 1. Resource Errors (リソース関連のエラー)
export abstract class ResourceError extends DomainError {
  constructor(message: string, code: string, statusCode: number = 404) {
    super(message, code, statusCode);
  }
}

export class ReservationNotFoundError extends ResourceError {
  constructor() {
    super('Reservation not found', 'RESERVATION_NOT_FOUND', 404);
  }
}


// 2. Validation Errors (バリデーションエラー)
export abstract class ValidationError extends DomainError {
  constructor(message: string, code: string) {
    super(message, code, 400);
  }
}

export class InvalidStaffIdError extends ValidationError {
  constructor() {
    super('Staff ID cannot be empty', 'INVALID_STAFF_ID');
  }
}

export class PastTimeReservationError extends ValidationError {
  constructor() {
    super('Cannot create reservation for past time', 'PAST_TIME_RESERVATION');
  }
}


// 3. Business Rule Errors (ビジネスルール違反)
export abstract class BusinessRuleError extends DomainError {
  constructor(message: string, code: string, statusCode: number = 400) {
    super(message, code, statusCode);
  }
}

export class TimeSlotConflictError extends BusinessRuleError {
  constructor() {
    super('Time slot already reserved', 'TIME_SLOT_CONFLICT', 409);
  }
}

export class ReservationCapacityExceededError extends BusinessRuleError {
  constructor() {
    super('Reservation capacity exceeded', 'CAPACITY_EXCEEDED', 400);
  }
}


// 4. State Transition Errors (状態遷移エラー)
export abstract class StateTransitionError extends DomainError {
  constructor(
    message: string,
    code: string,
    public readonly currentStatus?: string,
    public readonly targetStatus?: string
  ) {
    super(message, code, 400);
  }
}

export class InvalidReservationStatusError extends StateTransitionError {
  constructor(currentStatus: string, targetStatus: string) {
    super(
      `Cannot change status from ${currentStatus} to ${targetStatus}`,
      'INVALID_STATUS_TRANSITION',
      currentStatus,
      targetStatus
    );
  }
}

export class CannotConfirmReservationError extends StateTransitionError {
  constructor(currentStatus: string) {
    super(
      `Cannot confirm reservation in current status: ${currentStatus}`,
      'CANNOT_CONFIRM_RESERVATION',
      currentStatus,
      'CONFIRMED'
    );
  }
}

export class CannotCancelReservationError extends StateTransitionError {
  constructor(currentStatus: string) {
    super(
      `Cannot cancel reservation in current status: ${currentStatus}`,
      'CANNOT_CANCEL_RESERVATION',
      currentStatus,
      'CANCELLED'
    );
  }
}

export class CannotCompleteReservationError extends StateTransitionError {
  constructor(reason: string) {
    super(
      `Cannot complete reservation: ${reason}`,
      'CANNOT_COMPLETE_RESERVATION'
    );
  }
}

export class CannotMarkNoShowError extends StateTransitionError {
  constructor(reason: string) {
    super(
      `Cannot mark as no-show: ${reason}`,
      'CANNOT_MARK_NO_SHOW'
    );
  }
}


// 5. Operation Errors (操作エラー)
export abstract class OperationError extends DomainError {
  constructor(message: string, code: string) {
    super(message, code, 400);
  }
}

export class CannotRescheduleReservationError extends OperationError {
  constructor(reason: string) {
    super(
      `Cannot reschedule reservation: ${reason}`,
      'CANNOT_RESCHEDULE_RESERVATION'
    );
  }
}

export class CannotReassignStaffError extends OperationError {
  constructor(reason: string) {
    super(
      `Cannot reassign staff: ${reason}`,
      'CANNOT_REASSIGN_STAFF'
    );
  }
}
