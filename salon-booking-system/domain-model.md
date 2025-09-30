# ドメインモデル設計

## 中核サブドメイン：予約管理

### エンティティ

#### Reservation（予約）
```
Reservation {
  id: ReservationId
  customerId: CustomerId
  staffId: StaffId
  menuId: MenuId
  timeSlot: TimeSlot
  status: ReservationStatus
  note: string
  createdAt: DateTime
  updatedAt: DateTime
}
```

### 値オブジェクト

#### TimeSlot（タイムスロット）
```
TimeSlot {
  date: Date
  startTime: Time
  endTime: Time

  methods:
    - isOverlapping(other: TimeSlot): boolean
    - duration(): Minutes
}
```

#### ReservationStatus（予約ステータス）
```
ReservationStatus {
  TENTATIVE    // 仮予約
  CONFIRMED    // 確定
  COMPLETED    // 完了
  CANCELLED    // キャンセル
}
```

### 集約

#### ReservationAggregate
- 集約ルート: Reservation
- 不変条件:
  - 同一スタッフの同一時間帯に重複予約は作成できないこと
  - キャンセルは予約時間の24時間前まで可能であること
  - ステータスは定められた遷移ルールに従うこと

### ドメインサービス

#### ReservationService
```
ReservationService {
  - checkAvailability(staffId, timeSlot): boolean
  - applyaCancellationPolicy(reservation): CancellationFee
  - suggestAlternativeSlots(menuId, date): TimeSlot[]
}
```

### リポジトリインターフェース

#### ReservationRepository
```
interface ReservationRepository {
  save(reservation: Reservation): void
  findById(id: ReservationId): Reservation
  findByStaffAndTimeSlot(staffId, timeSlot): Reservation[]
  findByCustomer(customerId): Reservation[]
}
```

## 支援サブドメイン：スケジュール管理

### エンティティ

#### StaffSchedule（スタッフスケジュール）
```
StaffSchedule {
  id: ScheduleId
  staffId: StaffId
  date: Date
  workingHours: WorkingHours[]
  breaks: Break[]
}
```

### 値オブジェクト

#### WorkingHours（勤務時間）
```
WorkingHours {
  startTime: Time
  endTime: Time
}
```

#### Break（休憩）
```
Break {
  startTime: Time
  endTime: Time
}
```

## 支援サブドメイン：顧客管理

### エンティティ

#### Customer（顧客）
```
Customer {
  id: CustomerId
  name: Name
  email: Email
  phone: PhoneNumber
  favoriteMenuIds: MenuId[]
  membershipLevel: MembershipLevel
}
```

### 値オブジェクト

#### Name（名前）
```
Name {
  firstName: string
  lastName: string

  methods:
    - fullName(): string
}
```

#### Email（メールアドレス）
```
Email {
  value: string

  constructor:
    - validate email format
}
```

## コンテキスト間の連携

### コンテキストマップ
```
[予約管理] <--共有カーネル--> [スケジュール管理]
    |                              |
    | 公開ホストサービス            |
    v                              v
[通知]                        [顧客管理]
    ^                              |
    |                              |
    +--------- 順応者 --------------+

[認証] --公開ホストサービス--> 全コンテキスト
```

### 統合パターン
- **予約管理 ⇔ スケジュール管理**: 共有カーネル（TimeSlot、StaffIdを共有）
- **予約管理 → 通知**: 公開ホストサービス（予約イベントをPublish）
- **顧客管理 → 通知**: 順応者（通知コンテキストのインターフェースに合わせる）
- **認証 → 各コンテキスト**: 公開ホストサービス（認証APIを提供）
