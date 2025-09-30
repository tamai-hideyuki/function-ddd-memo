# 予約管理コンテキスト - ドメインモデル詳細設計

## コンテキスト概要
予約管理コンテキストは、美容院予約システムの中核となる境界づけられたコンテキスト
顧客の予約作成、変更、キャンセルなどの中心的なビジネスロジックを管理する

## ドメインモデル構成要素

### エンティティ

#### 1. Reservation（予約）
これは予約を表す集約ルートエンティティ

```typescript
class Reservation {
  private readonly id: ReservationId
  private customerId: CustomerId
  private staffId: StaffId
  private menuId: MenuId
  private timeSlot: TimeSlot
  private status: ReservationStatus
  private note: string
  private readonly createdAt: DateTime
  private updatedAt: DateTime
  private version: number // 楽観的ロック用

  // ビジネスロジック
  confirm(): void {
    if (this.status !== ReservationStatus.TENTATIVE) {
      throw new InvalidStateTransitionError()
    }
    this.status = ReservationStatus.CONFIRMED
    this.updatedAt = DateTime.now()
  }

  cancel(policy: CancellationPolicy): CancellationResult {
    if (!this.canBeCancelled()) {
      throw new CannotCancelError()
    }
    const fee = policy.calculateFee(this)
    this.status = ReservationStatus.CANCELLED
    this.updatedAt = DateTime.now()
    return new CancellationResult(fee)
  }

  complete(): void {
    if (this.status !== ReservationStatus.CONFIRMED) {
      throw new InvalidStateTransitionError()
    }
    this.status = ReservationStatus.COMPLETED
    this.updatedAt = DateTime.now()
  }

  reschedule(newTimeSlot: TimeSlot): void {
    if (this.status === ReservationStatus.CANCELLED ||
        this.status === ReservationStatus.COMPLETED) {
      throw new CannotRescheduleError()
    }
    this.timeSlot = newTimeSlot
    this.updatedAt = DateTime.now()
  }

  private canBeCancelled(): boolean {
    return this.status !== ReservationStatus.COMPLETED &&
           this.status !== ReservationStatus.CANCELLED
  }
}
```

#### 2. Menu（メニュー）
これは提供サービスを表すエンティティ

```typescript
class Menu {
  private readonly id: MenuId
  private name: string
  private description: string
  private duration: Duration
  private price: Money
  private requiredSkills: SkillSet
  private isActive: boolean

  canBePerformedBy(staff: Staff): boolean {
    return staff.hasRequiredSkills(this.requiredSkills)
  }

  calculateEndTime(startTime: Time): Time {
    return startTime.add(this.duration)
  }
}
```

#### 3. Staff（スタッフ）
これはサービス提供者を表すエンティティ

```typescript
class Staff {
  private readonly id: StaffId
  private name: StaffName
  private skills: SkillSet
  private workingHours: WorkingHours
  private specialties: MenuId[]

  isAvailableAt(timeSlot: TimeSlot): boolean {
    return this.workingHours.contains(timeSlot)
  }

  hasRequiredSkills(required: SkillSet): boolean {
    return this.skills.contains(required)
  }

  isSpecializedIn(menuId: MenuId): boolean {
    return this.specialties.includes(menuId)
  }
}
```

### 値オブジェクト

#### 1. ReservationId（予約ID）
```typescript
class ReservationId {
  private readonly value: string

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error("ReservationId cannot be empty")
    }
    this.value = value
  }

  equals(other: ReservationId): boolean {
    return this.value === other.value
  }

  toString(): string {
    return this.value
  }
}
```

#### 2. TimeSlot（時間枠）
```typescript
class TimeSlot {
  private readonly date: Date
  private readonly startTime: Time
  private readonly endTime: Time

  constructor(date: Date, startTime: Time, endTime: Time) {
    if (startTime.isAfterOrEqual(endTime)) {
      throw new Error("Start time must be before end time")
    }
    this.date = date
    this.startTime = startTime
    this.endTime = endTime
  }

  isOverlapping(other: TimeSlot): boolean {
    if (!this.date.equals(other.date)) {
      return false
    }
    return this.startTime.isBefore(other.endTime) &&
           other.startTime.isBefore(this.endTime)
  }

  duration(): Duration {
    return Duration.between(this.startTime, this.endTime)
  }

  contains(time: Time): boolean {
    return this.startTime.isBeforeOrEqual(time) &&
           time.isBefore(this.endTime)
  }
}
```

#### 3. ReservationStatus（予約ステータス）
```typescript
enum ReservationStatus {
  TENTATIVE = "TENTATIVE",     // 仮予約
  CONFIRMED = "CONFIRMED",     // 確定
  COMPLETED = "COMPLETED",     // 完了
  CANCELLED = "CANCELLED"      // キャンセル
}

// ステータス遷移ルール
const validTransitions = {
  [ReservationStatus.TENTATIVE]: [
    ReservationStatus.CONFIRMED,
    ReservationStatus.CANCELLED
  ],
  [ReservationStatus.CONFIRMED]: [
    ReservationStatus.COMPLETED,
    ReservationStatus.CANCELLED
  ],
  [ReservationStatus.COMPLETED]: [],
  [ReservationStatus.CANCELLED]: []
}
```

#### 4. Money（金額）
```typescript
class Money {
  private readonly amount: number
  private readonly currency: Currency

  constructor(amount: number, currency: Currency) {
    if (amount < 0) {
      throw new Error("Amount cannot be negative")
    }
    this.amount = amount
    this.currency = currency
  }

  add(other: Money): Money {
    if (!this.currency.equals(other.currency)) {
      throw new Error("Cannot add different currencies")
    }
    return new Money(this.amount + other.amount, this.currency)
  }

  multiply(factor: number): Money {
    return new Money(this.amount * factor, this.currency)
  }
}
```

#### 5. Duration（期間）
```typescript
class Duration {
  private readonly minutes: number

  constructor(minutes: number) {
    if (minutes < 0) {
      throw new Error("Duration cannot be negative")
    }
    this.minutes = minutes
  }

  static fromHours(hours: number): Duration {
    return new Duration(hours * 60)
  }

  toMinutes(): number {
    return this.minutes
  }

  add(other: Duration): Duration {
    return new Duration(this.minutes + other.minutes)
  }
}
```

### ドメインサービス

#### 1. ReservationService
これは予約に関する複雑なビジネスロジックを扱うサービス

```typescript
class ReservationService {
  constructor(
    private reservationRepo: ReservationRepository,
    private staffRepo: StaffRepository,
    private menuRepo: MenuRepository
  ) {}

  async checkAvailability(
    staffId: StaffId,
    timeSlot: TimeSlot
  ): Promise<boolean> {
    const staff = await this.staffRepo.findById(staffId)
    if (!staff.isAvailableAt(timeSlot)) {
      return false
    }

    const existingReservations = await this.reservationRepo
      .findByStaffAndTimeSlot(staffId, timeSlot)

    return existingReservations.length === 0
  }

  async suggestAlternativeSlots(
    menuId: MenuId,
    preferredDate: Date,
    staffId?: StaffId
  ): Promise<TimeSlot[]> {
    const menu = await this.menuRepo.findById(menuId)
    const duration = menu.getDuration()

    const availableStaff = staffId
      ? [await this.staffRepo.findById(staffId)]
      : await this.staffRepo.findByMenuCapability(menuId)

    const suggestions: TimeSlot[] = []

    for (const staff of availableStaff) {
      const slots = await this.findAvailableSlots(
        staff,
        preferredDate,
        duration
      )
      suggestions.push(...slots)
    }

    return suggestions.slice(0, 5) // 最大5件の提案
  }

  private async findAvailableSlots(
    staff: Staff,
    date: Date,
    duration: Duration
  ): Promise<TimeSlot[]> {
    const workingHours = staff.getWorkingHoursOn(date)
    const existingReservations = await this.reservationRepo
      .findByStaffAndDate(staff.getId(), date)

    return this.calculateAvailableSlots(
      workingHours,
      existingReservations,
      duration
    )
  }
}
```

#### 2. CancellationPolicy
これはキャンセルポリシーを表現するドメインサービス

```typescript
class CancellationPolicy {
  private readonly rules: CancellationRule[]

  constructor(rules: CancellationRule[]) {
    this.rules = rules
  }

  calculateFee(reservation: Reservation): Money {
    const hoursUntilAppointment = this.calculateHoursUntil(
      reservation.getTimeSlot()
    )

    for (const rule of this.rules) {
      if (rule.applies(hoursUntilAppointment)) {
        return rule.calculateFee(reservation.getPrice())
      }
    }

    return Money.zero()
  }

  private calculateHoursUntil(timeSlot: TimeSlot): number {
    const now = DateTime.now()
    const appointmentTime = timeSlot.getStartDateTime()
    return DateTime.hoursBetween(now, appointmentTime)
  }
}

class CancellationRule {
  constructor(
    private minHoursBefore: number,
    private maxHoursBefore: number,
    private feePercentage: number
  ) {}

  applies(hoursUntilAppointment: number): boolean {
    return hoursUntilAppointment >= this.minHoursBefore &&
           hoursUntilAppointment < this.maxHoursBefore
  }

  calculateFee(basePrice: Money): Money {
    return basePrice.multiply(this.feePercentage / 100)
  }
}
```

### リポジトリインターフェース

#### ReservationRepository
```typescript
interface ReservationRepository {
  // 基本的なCRUD操作
  save(reservation: Reservation): Promise<void>
  findById(id: ReservationId): Promise<Reservation | null>
  delete(id: ReservationId): Promise<void>

  // ビジネスロジックのための検索
  findByStaffAndTimeSlot(
    staffId: StaffId,
    timeSlot: TimeSlot
  ): Promise<Reservation[]>

  findByStaffAndDate(
    staffId: StaffId,
    date: Date
  ): Promise<Reservation[]>

  findByCustomer(
    customerId: CustomerId,
    status?: ReservationStatus
  ): Promise<Reservation[]>

  findConflicting(
    staffId: StaffId,
    timeSlot: TimeSlot,
    excludeId?: ReservationId
  ): Promise<Reservation[]>

  // ページング対応
  findByDateRange(
    startDate: Date,
    endDate: Date,
    page: number,
    size: number
  ): Promise<Page<Reservation>>
}
```

### 集約

#### ReservationAggregate
これは予約集約の設計詳細

```typescript
// 集約ルート: Reservation
// 集約境界内のエンティティ: Reservation のみ

// 不変条件（Invariants）
class ReservationInvariants {
  // 1. 同一スタッフの同一時間帯に重複予約は作成できない
  static ensureNoDoubleBooking(
    existingReservations: Reservation[],
    newTimeSlot: TimeSlot
  ): void {
    const hasConflict = existingReservations.some(r =>
      r.getTimeSlot().isOverlapping(newTimeSlot) &&
      r.getStatus() !== ReservationStatus.CANCELLED
    )

    if (hasConflict) {
      throw new DoubleBookingError()
    }
  }

  // 2. キャンセルは予約時間の24時間前まで可能
  static ensureCancellationDeadline(
    reservation: Reservation,
    policy: CancellationPolicy
  ): void {
    const hoursUntil = DateTime.hoursBetween(
      DateTime.now(),
      reservation.getTimeSlot().getStartDateTime()
    )

    if (hoursUntil < 24 && !policy.allowsLateCancellation()) {
      throw new PastCancellationDeadlineError()
    }
  }

  // 3. ステータスは定められた遷移ルールに従う
  static ensureValidStatusTransition(
    from: ReservationStatus,
    to: ReservationStatus
  ): void {
    const validTransitions = getValidTransitions(from)

    if (!validTransitions.includes(to)) {
      throw new InvalidStatusTransitionError(from, to)
    }
  }
}
```

### ドメインイベント

```typescript
// 予約作成イベント
class ReservationCreated implements DomainEvent {
  constructor(
    public readonly reservationId: ReservationId,
    public readonly customerId: CustomerId,
    public readonly staffId: StaffId,
    public readonly timeSlot: TimeSlot,
    public readonly occurredAt: DateTime
  ) {}
}

// 予約確定イベント
class ReservationConfirmed implements DomainEvent {
  constructor(
    public readonly reservationId: ReservationId,
    public readonly occurredAt: DateTime
  ) {}
}

// 予約キャンセルイベント
class ReservationCancelled implements DomainEvent {
  constructor(
    public readonly reservationId: ReservationId,
    public readonly cancellationFee: Money,
    public readonly reason: string,
    public readonly occurredAt: DateTime
  ) {}
}

// 予約完了イベント
class ReservationCompleted implements DomainEvent {
  constructor(
    public readonly reservationId: ReservationId,
    public readonly completedAt: DateTime
  ) {}
}
```

## ユビキタス言語について考えてみる

| 用語 | 定義 | 実装での表現 |
|------|------|------------|
| 予約（Reservation） | 顧客が特定の日時にサービスを受けるための約束 | Reservationエンティティ |
| タイムスロット（TimeSlot） | 予約可能な時間枠 | TimeSlot値オブジェクト |
| 仮予約（Tentative） | まだ確定していない予約状態 | ReservationStatus.TENTATIVE |
| 予約確定（Confirm） | 予約を確定する行為 | Reservation.confirm()メソッド |
| ダブルブッキング | 同一スタッフの同一時間帯への重複予約 | DoubleBookingError |
| キャンセルポリシー | 予約取消に関する規定 | CancellationPolicyサービス |
| キャンセル料 | 予約取消時に発生する料金 | Money値オブジェクト |

## コンテキスト間の連携について

### 必要な外部コンテキストとの連携は？

1. **スケジュール管理コンテキスト**
   - スタッフの勤務時間情報を取得
   - 営業日カレンダーの確認

2. **顧客管理コンテキスト**
   - 顧客情報の参照
   - 会員レベルによる特典適用

3. **通知コンテキスト**
   - 予約確認メールの送信
   - リマインダー通知

### 公開するドメインイベントについて

- ReservationCreated: 新規予約作成時
- ReservationConfirmed: 予約確定時
- ReservationCancelled: 予約キャンセル時
- ReservationCompleted: サービス提供完了時

これらのイベントは、他のコンテキストが予約管理の状態変化に反応できるようにしようと思う。
