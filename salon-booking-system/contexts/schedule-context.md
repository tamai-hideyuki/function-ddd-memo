# スケジュール管理コンテキスト - ドメインモデル詳細設計

## コンテキスト概要
スケジュール管理コンテキストは、スタッフの勤務スケジュール、営業日カレンダー、空き時間の管理を担当する支援サブドメイン
予約管理コンテキストに対して、予約可能な時間枠の情報を提供する

## ドメインモデル構成要素について

### エンティティ

#### 1. StaffSchedule（スタッフスケジュール）
これはスタッフの勤務スケジュールを表す集約ルートエンティティ

```typescript
class StaffSchedule {
  private readonly id: ScheduleId
  private readonly staffId: StaffId
  private date: Date
  private workingPeriods: WorkingPeriod[]
  private breaks: BreakPeriod[]
  private dayOffReason?: DayOffReason
  private readonly createdAt: DateTime
  private updatedAt: DateTime

  // ビジネスロジック
  isWorkingDay(): boolean {
    return this.workingPeriods.length > 0 && !this.dayOffReason
  }

  addWorkingPeriod(period: WorkingPeriod): void {
    this.validateNoOverlap(period)
    this.workingPeriods.push(period)
    this.updatedAt = DateTime.now()
  }

  addBreak(breakPeriod: BreakPeriod): void {
    if (!this.isWithinWorkingHours(breakPeriod)) {
      throw new BreakOutsideWorkingHoursError()
    }
    this.breaks.push(breakPeriod)
    this.updatedAt = DateTime.now()
  }

  getAvailableSlots(slotDuration: Duration): TimeSlot[] {
    const availableSlots: TimeSlot[] = []

    for (const period of this.workingPeriods) {
      const slots = this.generateSlotsForPeriod(period, slotDuration)
      const filteredSlots = this.filterOutBreaks(slots)
      availableSlots.push(...filteredSlots)
    }

    return availableSlots
  }

  isAvailableAt(timeSlot: TimeSlot): boolean {
    if (!this.date.equals(timeSlot.getDate())) {
      return false
    }

    const isInWorkingPeriod = this.workingPeriods.some(period =>
      period.contains(timeSlot)
    )

    const isInBreak = this.breaks.some(breakPeriod =>
      breakPeriod.overlaps(timeSlot)
    )

    return isInWorkingPeriod && !isInBreak
  }

  private validateNoOverlap(newPeriod: WorkingPeriod): void {
    const hasOverlap = this.workingPeriods.some(existing =>
      existing.overlaps(newPeriod)
    )

    if (hasOverlap) {
      throw new WorkingPeriodOverlapError()
    }
  }

  private isWithinWorkingHours(breakPeriod: BreakPeriod): boolean {
    return this.workingPeriods.some(period =>
      period.fullyContains(breakPeriod)
    )
  }

  private generateSlotsForPeriod(
    period: WorkingPeriod,
    slotDuration: Duration
  ): TimeSlot[] {
    const slots: TimeSlot[] = []
    let currentStart = period.getStartTime()

    while (currentStart.plus(slotDuration).isBeforeOrEqual(period.getEndTime())) {
      slots.push(new TimeSlot(
        this.date,
        currentStart,
        currentStart.plus(slotDuration)
      ))
      currentStart = currentStart.plus(slotDuration)
    }

    return slots
  }

  private filterOutBreaks(slots: TimeSlot[]): TimeSlot[] {
    return slots.filter(slot =>
      !this.breaks.some(breakPeriod => breakPeriod.overlaps(slot))
    )
  }
}
```

#### 2. BusinessCalendar（営業カレンダー）
これは店舗の営業日を管理するエンティティ

```typescript
class BusinessCalendar {
  private readonly id: CalendarId
  private readonly year: Year
  private regularHolidays: DayOfWeek[] // 定休日
  private specialHolidays: Holiday[] // 特別休業日
  private specialBusinessDays: SpecialBusinessDay[] // 特別営業日
  private businessHours: Map<DayOfWeek, BusinessHours>

  isBusinessDay(date: Date): boolean {
    // 特別休業日チェック
    if (this.isSpecialHoliday(date)) {
      return false
    }

    // 特別営業日チェック
    if (this.isSpecialBusinessDay(date)) {
      return true
    }

    // 定休日チェック
    const dayOfWeek = date.getDayOfWeek()
    return !this.regularHolidays.includes(dayOfWeek)
  }

  getBusinessHours(date: Date): BusinessHours | null {
    if (!this.isBusinessDay(date)) {
      return null
    }

    // 特別営業日の営業時間
    const specialDay = this.specialBusinessDays.find(day =>
      day.getDate().equals(date)
    )
    if (specialDay) {
      return specialDay.getBusinessHours()
    }

    // 通常の営業時間
    const dayOfWeek = date.getDayOfWeek()
    return this.businessHours.get(dayOfWeek) || null
  }

  addSpecialHoliday(holiday: Holiday): void {
    this.validateDateInYear(holiday.getDate())
    this.specialHolidays.push(holiday)
  }

  addSpecialBusinessDay(specialDay: SpecialBusinessDay): void {
    this.validateDateInYear(specialDay.getDate())
    this.specialBusinessDays.push(specialDay)
  }

  private isSpecialHoliday(date: Date): boolean {
    return this.specialHolidays.some(holiday =>
      holiday.getDate().equals(date)
    )
  }

  private isSpecialBusinessDay(date: Date): boolean {
    return this.specialBusinessDays.some(day =>
      day.getDate().equals(date)
    )
  }

  private validateDateInYear(date: Date): void {
    if (!this.year.contains(date)) {
      throw new DateOutOfCalendarYearError()
    }
  }
}
```

#### 3. ShiftTemplate（シフトテンプレート）
これは繰り返し使用されるシフトパターンを表すエンティティ

```typescript
class ShiftTemplate {
  private readonly id: TemplateId
  private name: string
  private description: string
  private workingPeriods: WorkingPeriod[]
  private breaks: BreakPeriod[]
  private applicableDays: DayOfWeek[]

  applyToDate(staffId: StaffId, date: Date): StaffSchedule {
    if (!this.isApplicableOn(date)) {
      throw new TemplateNotApplicableError()
    }

    return new StaffSchedule({
      staffId,
      date,
      workingPeriods: [...this.workingPeriods],
      breaks: [...this.breaks]
    })
  }

  private isApplicableOn(date: Date): boolean {
    return this.applicableDays.includes(date.getDayOfWeek())
  }
}
```

### 値オブジェクト

#### 1. WorkingPeriod（勤務時間帯）
```typescript
class WorkingPeriod {
  private readonly startTime: Time
  private readonly endTime: Time

  constructor(startTime: Time, endTime: Time) {
    if (startTime.isAfterOrEqual(endTime)) {
      throw new Error("Start time must be before end time")
    }
    this.startTime = startTime
    this.endTime = endTime
  }

  contains(timeSlot: TimeSlot): boolean {
    return this.startTime.isBeforeOrEqual(timeSlot.getStartTime()) &&
           this.endTime.isAfterOrEqual(timeSlot.getEndTime())
  }

  fullyContains(period: { getStartTime(): Time; getEndTime(): Time }): boolean {
    return this.startTime.isBeforeOrEqual(period.getStartTime()) &&
           this.endTime.isAfterOrEqual(period.getEndTime())
  }

  overlaps(other: WorkingPeriod): boolean {
    return this.startTime.isBefore(other.endTime) &&
           other.startTime.isBefore(this.endTime)
  }

  duration(): Duration {
    return Duration.between(this.startTime, this.endTime)
  }
}
```

#### 2. BreakPeriod（休憩時間）
```typescript
class BreakPeriod {
  private readonly startTime: Time
  private readonly endTime: Time
  private readonly type: BreakType

  constructor(startTime: Time, endTime: Time, type: BreakType) {
    if (startTime.isAfterOrEqual(endTime)) {
      throw new Error("Break start time must be before end time")
    }

    const duration = Duration.between(startTime, endTime)
    if (type === BreakType.LUNCH && duration.toMinutes() < 30) {
      throw new Error("Lunch break must be at least 30 minutes")
    }

    this.startTime = startTime
    this.endTime = endTime
    this.type = type
  }

  overlaps(timeSlot: TimeSlot): boolean {
    return this.startTime.isBefore(timeSlot.getEndTime()) &&
           timeSlot.getStartTime().isBefore(this.endTime)
  }

  duration(): Duration {
    return Duration.between(this.startTime, this.endTime)
  }
}

enum BreakType {
  SHORT = "SHORT",     // 小休憩
  LUNCH = "LUNCH",     // 昼休憩
  OTHER = "OTHER"      // その他
}
```

#### 3. Holiday（休業日）
```typescript
class Holiday {
  private readonly date: Date
  private readonly reason: string
  private readonly type: HolidayType

  constructor(date: Date, reason: string, type: HolidayType) {
    this.date = date
    this.reason = reason
    this.type = type
  }

  isRecurringAnnually(): boolean {
    return this.type === HolidayType.NATIONAL_HOLIDAY ||
           this.type === HolidayType.ANNUAL_CLOSURE
  }

  getDate(): Date {
    return this.date
  }
}

enum HolidayType {
  NATIONAL_HOLIDAY = "NATIONAL_HOLIDAY",   // 国民の祝日
  ANNUAL_CLOSURE = "ANNUAL_CLOSURE",       // 年次休業（年末年始等）
  TEMPORARY_CLOSURE = "TEMPORARY_CLOSURE",  // 臨時休業
  MAINTENANCE = "MAINTENANCE"               // メンテナンス休業
}
```

#### 4. BusinessHours（営業時間）
```typescript
class BusinessHours {
  private readonly openTime: Time
  private readonly closeTime: Time
  private readonly lastReservationTime: Time

  constructor(
    openTime: Time,
    closeTime: Time,
    lastReservationTime?: Time
  ) {
    if (openTime.isAfterOrEqual(closeTime)) {
      throw new Error("Open time must be before close time")
    }

    this.openTime = openTime
    this.closeTime = closeTime
    this.lastReservationTime = lastReservationTime || closeTime

    if (this.lastReservationTime.isAfter(closeTime)) {
      throw new Error("Last reservation time cannot be after close time")
    }
  }

  isWithinBusinessHours(time: Time): boolean {
    return this.openTime.isBeforeOrEqual(time) &&
           time.isBeforeOrEqual(this.closeTime)
  }

  canAcceptReservation(time: Time): boolean {
    return this.openTime.isBeforeOrEqual(time) &&
           time.isBeforeOrEqual(this.lastReservationTime)
  }
}
```

#### 5. DayOffReason（休暇理由）
```typescript
class DayOffReason {
  private readonly type: DayOffType
  private readonly description?: string

  constructor(type: DayOffType, description?: string) {
    this.type = type
    this.description = description
  }

  isPaid(): boolean {
    return this.type === DayOffType.PAID_LEAVE ||
           this.type === DayOffType.SPECIAL_LEAVE
  }

  requiresApproval(): boolean {
    return this.type !== DayOffType.REGULAR_DAY_OFF
  }
}

enum DayOffType {
  REGULAR_DAY_OFF = "REGULAR_DAY_OFF",     // 定休
  PAID_LEAVE = "PAID_LEAVE",               // 有給休暇
  SICK_LEAVE = "SICK_LEAVE",               // 病欠
  SPECIAL_LEAVE = "SPECIAL_LEAVE",         // 特別休暇
  TRAINING = "TRAINING",                   // 研修
  OTHER = "OTHER"                          // その他
}
```

### ドメインサービス

#### 1. ScheduleCoordinator
これは複数スタッフのスケジュール調整を行うサービス

```typescript
class ScheduleCoordinator {
  constructor(
    private scheduleRepo: ScheduleRepository,
    private calendarRepo: CalendarRepository
  ) {}

  async findAvailableStaff(
    date: Date,
    timeSlot: TimeSlot,
    requiredSkills?: SkillSet
  ): Promise<StaffId[]> {
    // 営業日チェック
    const calendar = await this.calendarRepo.findByYear(date.getYear())
    if (!calendar.isBusinessDay(date)) {
      return []
    }

    // 該当日のスケジュールを取得
    const schedules = await this.scheduleRepo.findByDate(date)

    // 利用可能なスタッフをフィルタリング
    const availableStaffIds = schedules
      .filter(schedule =>
        schedule.isWorkingDay() &&
        schedule.isAvailableAt(timeSlot)
      )
      .map(schedule => schedule.getStaffId())

    return availableStaffIds
  }

  async suggestOptimalShift(
    date: Date,
    expectedDemand: DemandForecast
  ): Promise<ShiftSuggestion[]> {
    const requiredStaffCount = this.calculateRequiredStaff(expectedDemand)
    const availableStaff = await this.getAvailableStaffForDate(date)

    return this.optimizeShiftAssignment(
      availableStaff,
      requiredStaffCount,
      expectedDemand.getPeakHours()
    )
  }

  async validateShiftCoverage(
    date: Date,
    minimumStaffRequired: number
  ): Promise<ValidationResult> {
    const schedules = await this.scheduleRepo.findByDate(date)
    const workingStaff = schedules.filter(s => s.isWorkingDay())

    const coverageByHour = this.calculateHourlyCoverage(workingStaff)
    const gaps = this.findCoverageGaps(coverageByHour, minimumStaffRequired)

    return new ValidationResult(gaps.length === 0, gaps)
  }

  private calculateRequiredStaff(demand: DemandForecast): number {
    // 需要予測に基づく必要スタッフ数の計算
    const baseStaff = 2
    const additionalPerBooking = 0.5
    return Math.ceil(baseStaff + (demand.getExpectedBookings() * additionalPerBooking))
  }

  private calculateHourlyCoverage(
    schedules: StaffSchedule[]
  ): Map<Time, number> {
    const coverage = new Map<Time, number>()

    // 営業時間を時間単位でループ
    for (let hour = 9; hour < 20; hour++) {
      const time = Time.fromHour(hour)
      const count = schedules.filter(s => {
        const slot = new TimeSlot(
          schedules[0].getDate(),
          time,
          time.plusMinutes(60)
        )
        return s.isAvailableAt(slot)
      }).length

      coverage.set(time, count)
    }

    return coverage
  }
}
```

#### 2. ScheduleTemplateService
これはシフトテンプレートの適用と管理を行うサービス

```typescript
class ScheduleTemplateService {
  constructor(
    private templateRepo: TemplateRepository,
    private scheduleRepo: ScheduleRepository
  ) {}

  async applyTemplateToWeek(
    templateId: TemplateId,
    staffId: StaffId,
    weekStartDate: Date
  ): Promise<StaffSchedule[]> {
    const template = await this.templateRepo.findById(templateId)
    const schedules: StaffSchedule[] = []

    for (let i = 0; i < 7; i++) {
      const date = weekStartDate.plusDays(i)

      try {
        const schedule = template.applyToDate(staffId, date)
        await this.scheduleRepo.save(schedule)
        schedules.push(schedule)
      } catch (e) {
        if (!(e instanceof TemplateNotApplicableError)) {
          throw e
        }
        // 適用できない日はスキップ
      }
    }

    return schedules
  }

  async createRotationSchedule(
    staffIds: StaffId[],
    startDate: Date,
    endDate: Date,
    rotationPattern: RotationPattern
  ): Promise<void> {
    const dates = this.getDateRange(startDate, endDate)
    const rotation = new StaffRotation(staffIds, rotationPattern)

    for (const date of dates) {
      const assignedStaff = rotation.getStaffForDate(date)

      for (const staffId of assignedStaff) {
        const template = await this.selectTemplateForDate(date)
        const schedule = template.applyToDate(staffId, date)
        await this.scheduleRepo.save(schedule)
      }

      rotation.advance()
    }
  }
}
```

### リポジトリインターフェース

#### ScheduleRepository
```typescript
interface ScheduleRepository {
  // 基本的なCRUD操作
  save(schedule: StaffSchedule): Promise<void>
  findById(id: ScheduleId): Promise<StaffSchedule | null>
  delete(id: ScheduleId): Promise<void>

  // ビジネスロジックのための検索
  findByStaffAndDate(
    staffId: StaffId,
    date: Date
  ): Promise<StaffSchedule | null>

  findByDate(date: Date): Promise<StaffSchedule[]>

  findByStaffAndDateRange(
    staffId: StaffId,
    startDate: Date,
    endDate: Date
  ): Promise<StaffSchedule[]>

  findByDateRange(
    startDate: Date,
    endDate: Date
  ): Promise<StaffSchedule[]>

  // 空き時間検索
  findAvailableSlots(
    date: Date,
    duration: Duration,
    staffId?: StaffId
  ): Promise<AvailableSlot[]>
}
```

#### CalendarRepository
```typescript
interface CalendarRepository {
  save(calendar: BusinessCalendar): Promise<void>
  findByYear(year: Year): Promise<BusinessCalendar | null>
  findCurrentCalendar(): Promise<BusinessCalendar>
}
```

### 集約

#### StaffScheduleAggregate
これはスタッフスケジュール集約の設計詳細

```typescript
// 集約ルート: StaffSchedule
// 集約境界内のエンティティ: StaffSchedule のみ

// 不変条件（Invariants）
class ScheduleInvariants {
  // 1. 勤務時間帯は重複してはいけない
  static ensureNoOverlappingWorkPeriods(
    periods: WorkingPeriod[]
  ): void {
    for (let i = 0; i < periods.length; i++) {
      for (let j = i + 1; j < periods.length; j++) {
        if (periods[i].overlaps(periods[j])) {
          throw new WorkingPeriodOverlapError()
        }
      }
    }
  }

  // 2. 休憩時間は勤務時間内に収まっていなければならない
  static ensureBreaksWithinWorkingHours(
    workingPeriods: WorkingPeriod[],
    breaks: BreakPeriod[]
  ): void {
    for (const breakPeriod of breaks) {
      const isContained = workingPeriods.some(period =>
        period.fullyContains(breakPeriod)
      )

      if (!isContained) {
        throw new BreakOutsideWorkingHoursError()
      }
    }
  }

  // 3. 1日の勤務時間は法定労働時間を超えてはいけない
  static ensureLegalWorkingHours(
    workingPeriods: WorkingPeriod[],
    breaks: BreakPeriod[]
  ): void {
    const totalWorkMinutes = workingPeriods.reduce(
      (sum, period) => sum + period.duration().toMinutes(),
      0
    )

    const totalBreakMinutes = breaks.reduce(
      (sum, breakPeriod) => sum + breakPeriod.duration().toMinutes(),
      0
    )

    const netWorkMinutes = totalWorkMinutes - totalBreakMinutes
    const maxLegalMinutes = 8 * 60 // 8時間

    if (netWorkMinutes > maxLegalMinutes) {
      throw new ExceedsLegalWorkingHoursError()
    }
  }
}
```

### ドメインイベント

```typescript
// スケジュール作成イベント
class ScheduleCreated implements DomainEvent {
  constructor(
    public readonly scheduleId: ScheduleId,
    public readonly staffId: StaffId,
    public readonly date: Date,
    public readonly occurredAt: DateTime
  ) {}
}

// スケジュール更新イベント
class ScheduleUpdated implements DomainEvent {
  constructor(
    public readonly scheduleId: ScheduleId,
    public readonly changes: ScheduleChanges,
    public readonly occurredAt: DateTime
  ) {}
}

// 休暇申請イベント
class DayOffRequested implements DomainEvent {
  constructor(
    public readonly staffId: StaffId,
    public readonly date: Date,
    public readonly reason: DayOffReason,
    public readonly occurredAt: DateTime
  ) {}
}

// シフト交代イベント
class ShiftSwapped implements DomainEvent {
  constructor(
    public readonly fromStaffId: StaffId,
    public readonly toStaffId: StaffId,
    public readonly date: Date,
    public readonly occurredAt: DateTime
  ) {}
}
```

## ユビキタス言語を作ってみる

| 用語 | 定義 | 実装での表現 |
|------|------|------------|
| スケジュール（Schedule） | スタッフの1日の勤務予定 | StaffScheduleエンティティ |
| 勤務時間帯（Working Period） | 実際に勤務する時間の範囲 | WorkingPeriod値オブジェクト |
| 休憩（Break） | 勤務時間中の休憩時間 | BreakPeriod値オブジェクト |
| 営業日（Business Day） | 店舗が営業している日 | BusinessCalendarで管理 |
| 定休日（Regular Holiday） | 毎週固定の休業日 | DayOfWeek[]で表現 |
| シフト（Shift） | スタッフの勤務パターン | ShiftTemplateエンティティ |
| ローテーション（Rotation） | スタッフを順番に配置する仕組み | RotationPatternで表現 |

## コンテキスト間の連携について考えてみる

### 予約管理コンテキストとの連携（共有カーネル）
- TimeSlot値オブジェクトを共有
- StaffId値オブジェクトを共有
- 予約可能時間の問い合わせに応答

### 提供するサービスについて
1. **スケジュール照会API**
   - スタッフの勤務状況確認
   - 特定時間帯の空き状況確認

2. **営業日カレンダーAPI**
   - 営業日/休業日の確認
   - 営業時間の取得

### 必要な外部情報とは？⇩かな？
- スタッフマスタ（スタッフID、スキル情報）
- 需要予測データ（最適なシフト提案用）