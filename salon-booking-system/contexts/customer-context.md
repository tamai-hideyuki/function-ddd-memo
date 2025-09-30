# 顧客管理コンテキスト - ドメインモデル詳細設計

## コンテキスト概要
顧客管理コンテキストは、顧客情報の管理、予約履歴の記録、顧客の嗜好管理を担当する支援サブドメイン
顧客のプロフィール情報、連絡先、予約履歴、お気に入りメニューなどを管理し、パーソナライズされたサービス提供を支援する

## ドメインモデル構成要素

### エンティティ

#### 1. Customer（顧客）
これは顧客を表す集約ルートエンティティ

```typescript
class Customer {
  private readonly id: CustomerId
  private profile: CustomerProfile
  private contactInfo: ContactInfo
  private preferences: CustomerPreferences
  private membershipInfo: MembershipInfo
  private visitHistory: VisitRecord[]
  private tags: CustomerTag[]
  private readonly createdAt: DateTime
  private updatedAt: DateTime

  // ビジネスロジック
  updateProfile(newProfile: CustomerProfile): void {
    this.profile = newProfile
    this.updatedAt = DateTime.now()
  }

  updateContactInfo(newContactInfo: ContactInfo): void {
    const oldEmail = this.contactInfo.getEmail()
    const newEmail = newContactInfo.getEmail()

    this.contactInfo = newContactInfo

    if (!oldEmail.equals(newEmail)) {
      // メールアドレス変更時は検証が必要
      this.contactInfo.markAsUnverified()
    }

    this.updatedAt = DateTime.now()
  }

  addFavoriteMenu(menuId: MenuId): void {
    this.preferences.addFavoriteMenu(menuId)
    this.updatedAt = DateTime.now()
  }

  removeFavoriteMenu(menuId: MenuId): void {
    this.preferences.removeFavoriteMenu(menuId)
    this.updatedAt = DateTime.now()
  }

  recordVisit(visitRecord: VisitRecord): void {
    this.visitHistory.push(visitRecord)
    this.membershipInfo.addPoints(visitRecord.calculatePoints())
    this.updateMembershipLevel()
    this.updatedAt = DateTime.now()
  }

  applyTag(tag: CustomerTag): void {
    if (!this.hasTag(tag)) {
      this.tags.push(tag)
      this.updatedAt = DateTime.now()
    }
  }

  removeTag(tagId: TagId): void {
    this.tags = this.tags.filter(tag => !tag.getId().equals(tagId))
    this.updatedAt = DateTime.now()
  }

  private hasTag(tag: CustomerTag): boolean {
    return this.tags.some(t => t.equals(tag))
  }

  private updateMembershipLevel(): void {
    const newLevel = MembershipLevel.calculateFromPoints(
      this.membershipInfo.getTotalPoints()
    )
    this.membershipInfo.updateLevel(newLevel)
  }

  // 顧客セグメント判定
  getSegment(): CustomerSegment {
    const visitCount = this.visitHistory.length
    const lastVisit = this.getLastVisitDate()
    const totalSpent = this.calculateTotalSpent()

    if (visitCount === 0) {
      return CustomerSegment.NEW
    }

    if (this.isChurnRisk(lastVisit)) {
      return CustomerSegment.CHURN_RISK
    }

    if (this.isVIP(visitCount, totalSpent)) {
      return CustomerSegment.VIP
    }

    if (visitCount >= 5) {
      return CustomerSegment.REGULAR
    }

    return CustomerSegment.OCCASIONAL
  }

  private isChurnRisk(lastVisit: DateTime | null): boolean {
    if (!lastVisit) return false
    const daysSinceLastVisit = DateTime.daysBetween(lastVisit, DateTime.now())
    return daysSinceLastVisit > 90
  }

  private isVIP(visitCount: number, totalSpent: Money): boolean {
    return visitCount >= 20 || totalSpent.isGreaterThan(Money.of(100000))
  }

  private getLastVisitDate(): DateTime | null {
    if (this.visitHistory.length === 0) return null
    return this.visitHistory[this.visitHistory.length - 1].getVisitDate()
  }

  private calculateTotalSpent(): Money {
    return this.visitHistory.reduce(
      (total, visit) => total.add(visit.getAmount()),
      Money.zero()
    )
  }
}
```

#### 2. CustomerGroup（顧客グループ）
これは顧客をグループ化して管理するエンティティ

```typescript
class CustomerGroup {
  private readonly id: GroupId
  private name: string
  private description: string
  private criteria: GroupCriteria
  private members: CustomerId[]
  private benefits: GroupBenefit[]
  private isActive: boolean

  addMember(customerId: CustomerId): void {
    if (!this.members.includes(customerId)) {
      this.members.push(customerId)
    }
  }

  removeMember(customerId: CustomerId): void {
    this.members = this.members.filter(id => !id.equals(customerId))
  }

  applyBenefit(benefit: GroupBenefit): void {
    this.benefits.push(benefit)
  }

  evaluateMembership(customer: Customer): boolean {
    return this.criteria.isSatisfiedBy(customer)
  }

  getMemberCount(): number {
    return this.members.length
  }
}
```

### 値オブジェクト

#### 1. CustomerProfile（顧客プロフィール）
```typescript
class CustomerProfile {
  private readonly firstName: string
  private readonly lastName: string
  private readonly firstNameKana: string
  private readonly lastNameKana: string
  private readonly dateOfBirth?: Date
  private readonly gender?: Gender

  constructor(
    firstName: string,
    lastName: string,
    firstNameKana: string,
    lastNameKana: string,
    dateOfBirth?: Date,
    gender?: Gender
  ) {
    this.validateName(firstName, lastName)
    this.validateKana(firstNameKana, lastNameKana)

    this.firstName = firstName
    this.lastName = lastName
    this.firstNameKana = firstNameKana
    this.lastNameKana = lastNameKana
    this.dateOfBirth = dateOfBirth
    this.gender = gender
  }

  getFullName(): string {
    return `${this.lastName} ${this.firstName}`
  }

  getFullNameKana(): string {
    return `${this.lastNameKana} ${this.firstNameKana}`
  }

  getAge(): number | null {
    if (!this.dateOfBirth) return null
    return DateTime.yearsBetween(this.dateOfBirth, DateTime.now())
  }

  private validateName(firstName: string, lastName: string): void {
    if (!firstName || !lastName) {
      throw new Error("Name cannot be empty")
    }
  }

  private validateKana(firstNameKana: string, lastNameKana: string): void {
    const kanaRegex = /^[\u30A0-\u30FF]+$/
    if (!kanaRegex.test(firstNameKana) || !kanaRegex.test(lastNameKana)) {
      throw new Error("Kana must be in katakana")
    }
  }
}

enum Gender {
  MALE = "MALE",
  FEMALE = "FEMALE",
  OTHER = "OTHER",
  PREFER_NOT_TO_SAY = "PREFER_NOT_TO_SAY"
}
```

#### 2. ContactInfo（連絡先情報）
```typescript
class ContactInfo {
  private readonly email: Email
  private readonly phone: PhoneNumber
  private readonly address?: Address
  private emailVerified: boolean
  private phoneVerified: boolean

  constructor(
    email: Email,
    phone: PhoneNumber,
    address?: Address
  ) {
    this.email = email
    this.phone = phone
    this.address = address
    this.emailVerified = false
    this.phoneVerified = false
  }

  markEmailAsVerified(): void {
    this.emailVerified = true
  }

  markPhoneAsVerified(): void {
    this.phoneVerified = true
  }

  markAsUnverified(): void {
    this.emailVerified = false
    this.phoneVerified = false
  }

  isFullyVerified(): boolean {
    return this.emailVerified && this.phoneVerified
  }

  getEmail(): Email {
    return this.email
  }

  getPhone(): PhoneNumber {
    return this.phone
  }
}
```

#### 3. Email（メールアドレス）
```typescript
class Email {
  private readonly value: string

  constructor(value: string) {
    this.validateFormat(value)
    this.value = value.toLowerCase()
  }

  private validateFormat(email: string): void {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      throw new Error("Invalid email format")
    }
  }

  equals(other: Email): boolean {
    return this.value === other.value
  }

  toString(): string {
    return this.value
  }

  getDomain(): string {
    return this.value.split('@')[1]
  }
}
```

#### 4. PhoneNumber（電話番号）
```typescript
class PhoneNumber {
  private readonly countryCode: string
  private readonly number: string

  constructor(countryCode: string, number: string) {
    this.validateFormat(countryCode, number)
    this.countryCode = countryCode
    this.number = this.normalizeNumber(number)
  }

  private validateFormat(countryCode: string, number: string): void {
    if (!countryCode.match(/^\+\d{1,3}$/)) {
      throw new Error("Invalid country code format")
    }

    const normalizedNumber = number.replace(/[-\s]/g, '')
    if (!normalizedNumber.match(/^\d{10,15}$/)) {
      throw new Error("Invalid phone number format")
    }
  }

  private normalizeNumber(number: string): string {
    return number.replace(/[-\s]/g, '')
  }

  getFormattedNumber(): string {
    // 日本の電話番号の場合の例
    if (this.countryCode === '+81') {
      const match = this.number.match(/^(\d{2,4})(\d{2,4})(\d{4})$/)
      if (match) {
        return `${this.countryCode} ${match[1]}-${match[2]}-${match[3]}`
      }
    }
    return `${this.countryCode} ${this.number}`
  }

  equals(other: PhoneNumber): boolean {
    return this.countryCode === other.countryCode &&
           this.number === other.number
  }
}
```

#### 5. CustomerPreferences（顧客の嗜好）
```typescript
class CustomerPreferences {
  private favoriteMenuIds: MenuId[]
  private favoriteStaffIds: StaffId[]
  private preferredTimeSlots: PreferredTimeSlot[]
  private allergies: string[]
  private specialRequests: string

  constructor() {
    this.favoriteMenuIds = []
    this.favoriteStaffIds = []
    this.preferredTimeSlots = []
    this.allergies = []
    this.specialRequests = ""
  }

  addFavoriteMenu(menuId: MenuId): void {
    if (!this.favoriteMenuIds.some(id => id.equals(menuId))) {
      this.favoriteMenuIds.push(menuId)
    }
  }

  removeFavoriteMenu(menuId: MenuId): void {
    this.favoriteMenuIds = this.favoriteMenuIds.filter(
      id => !id.equals(menuId)
    )
  }

  addFavoriteStaff(staffId: StaffId): void {
    if (!this.favoriteStaffIds.some(id => id.equals(staffId))) {
      this.favoriteStaffIds.push(staffId)
    }
  }

  addPreferredTimeSlot(slot: PreferredTimeSlot): void {
    this.preferredTimeSlots.push(slot)
  }

  hasAllergy(allergen: string): boolean {
    return this.allergies.includes(allergen.toLowerCase())
  }

  getFavoriteMenuIds(): MenuId[] {
    return [...this.favoriteMenuIds]
  }

  getFavoriteStaffIds(): StaffId[] {
    return [...this.favoriteStaffIds]
  }
}

class PreferredTimeSlot {
  constructor(
    private readonly dayOfWeek: DayOfWeek,
    private readonly timeRange: TimeRange
  ) {}

  matches(date: Date, time: Time): boolean {
    return date.getDayOfWeek() === this.dayOfWeek &&
           this.timeRange.contains(time)
  }
}
```

#### 6. MembershipInfo（会員情報）
```typescript
class MembershipInfo {
  private level: MembershipLevel
  private totalPoints: number
  private currentYearPoints: number
  private memberSince: Date
  private expiryDate?: Date

  constructor(memberSince: Date) {
    this.level = MembershipLevel.BRONZE
    this.totalPoints = 0
    this.currentYearPoints = 0
    this.memberSince = memberSince
  }

  addPoints(points: number): void {
    this.totalPoints += points
    this.currentYearPoints += points
  }

  usePoints(points: number): void {
    if (points > this.totalPoints) {
      throw new Error("Insufficient points")
    }
    this.totalPoints -= points
  }

  updateLevel(newLevel: MembershipLevel): void {
    this.level = newLevel
  }

  resetYearlyPoints(): void {
    this.currentYearPoints = 0
  }

  getMembershipDuration(): Duration {
    return Duration.between(this.memberSince, DateTime.now())
  }

  getTotalPoints(): number {
    return this.totalPoints
  }

  getLevel(): MembershipLevel {
    return this.level
  }
}

enum MembershipLevel {
  BRONZE = "BRONZE",
  SILVER = "SILVER",
  GOLD = "GOLD",
  PLATINUM = "PLATINUM"
}

class MembershipLevelCalculator {
  static calculateFromPoints(points: number): MembershipLevel {
    if (points >= 10000) return MembershipLevel.PLATINUM
    if (points >= 5000) return MembershipLevel.GOLD
    if (points >= 2000) return MembershipLevel.SILVER
    return MembershipLevel.BRONZE
  }
}
```

#### 7. VisitRecord（来店記録）
```typescript
class VisitRecord {
  constructor(
    private readonly visitDate: DateTime,
    private readonly reservationId: ReservationId,
    private readonly menuId: MenuId,
    private readonly staffId: StaffId,
    private readonly amount: Money,
    private readonly satisfaction?: SatisfactionLevel,
    private readonly note?: string
  ) {}

  calculatePoints(): number {
    const basePoints = Math.floor(this.amount.getAmount() / 100)
    const bonusMultiplier = this.satisfaction === SatisfactionLevel.EXCELLENT ? 1.5 : 1.0
    return Math.floor(basePoints * bonusMultiplier)
  }

  getVisitDate(): DateTime {
    return this.visitDate
  }

  getAmount(): Money {
    return this.amount
  }
}

enum SatisfactionLevel {
  EXCELLENT = "EXCELLENT",
  GOOD = "GOOD",
  FAIR = "FAIR",
  POOR = "POOR"
}
```

### ドメインサービス

#### 1. CustomerSegmentationService
これは顧客セグメンテーションを行うサービス

```typescript
class CustomerSegmentationService {
  constructor(
    private customerRepo: CustomerRepository
  ) {}

  async segmentCustomers(): Promise<Map<CustomerSegment, CustomerId[]>> {
    const allCustomers = await this.customerRepo.findAll()
    const segmentation = new Map<CustomerSegment, CustomerId[]>()

    // セグメントを初期化
    for (const segment of Object.values(CustomerSegment)) {
      segmentation.set(segment as CustomerSegment, [])
    }

    // 各顧客をセグメントに分類
    for (const customer of allCustomers) {
      const segment = customer.getSegment()
      const currentSegment = segmentation.get(segment) || []
      currentSegment.push(customer.getId())
      segmentation.set(segment, currentSegment)
    }

    return segmentation
  }

  async findChurnRiskCustomers(): Promise<Customer[]> {
    const allCustomers = await this.customerRepo.findAll()
    return allCustomers.filter(
      customer => customer.getSegment() === CustomerSegment.CHURN_RISK
    )
  }

  async calculateLifetimeValue(customerId: CustomerId): Promise<Money> {
    const customer = await this.customerRepo.findById(customerId)
    const visitHistory = customer.getVisitHistory()

    // 過去の購買履歴から平均購買額を計算
    const totalSpent = visitHistory.reduce(
      (sum, visit) => sum.add(visit.getAmount()),
      Money.zero()
    )

    const averagePurchase = totalSpent.divide(visitHistory.length || 1)

    // 予測される将来の来店回数（簡易的な計算）
    const expectedFutureVisits = this.predictFutureVisits(customer)

    return averagePurchase.multiply(expectedFutureVisits)
  }

  private predictFutureVisits(customer: Customer): number {
    const segment = customer.getSegment()

    switch (segment) {
      case CustomerSegment.VIP:
        return 50
      case CustomerSegment.REGULAR:
        return 20
      case CustomerSegment.OCCASIONAL:
        return 10
      case CustomerSegment.NEW:
        return 5
      case CustomerSegment.CHURN_RISK:
        return 2
      default:
        return 5
    }
  }
}
```

#### 2. CustomerMergeService
これは重複顧客の統合を行うサービス

```typescript
class CustomerMergeService {
  constructor(
    private customerRepo: CustomerRepository
  ) {}

  async mergeDuplicateCustomers(
    primaryId: CustomerId,
    duplicateId: CustomerId
  ): Promise<Customer> {
    const primary = await this.customerRepo.findById(primaryId)
    const duplicate = await this.customerRepo.findById(duplicateId)

    // 訪問履歴を統合
    const mergedVisitHistory = this.mergeVisitHistory(
      primary.getVisitHistory(),
      duplicate.getVisitHistory()
    )

    // ポイントを統合
    const totalPoints =
      primary.getMembershipInfo().getTotalPoints() +
      duplicate.getMembershipInfo().getTotalPoints()

    // プライマリ顧客に統合
    primary.mergeFrom(duplicate, mergedVisitHistory, totalPoints)

    // 重複顧客を無効化
    duplicate.markAsInactive()

    await this.customerRepo.save(primary)
    await this.customerRepo.save(duplicate)

    return primary
  }

  private mergeVisitHistory(
    primary: VisitRecord[],
    duplicate: VisitRecord[]
  ): VisitRecord[] {
    const merged = [...primary, ...duplicate]

    // 訪問日時でソート
    merged.sort((a, b) =>
      a.getVisitDate().compareTo(b.getVisitDate())
    )

    return merged
  }

  async findPotentialDuplicates(): Promise<DuplicateCandidate[]> {
    const customers = await this.customerRepo.findAll()
    const candidates: DuplicateCandidate[] = []

    for (let i = 0; i < customers.length; i++) {
      for (let j = i + 1; j < customers.length; j++) {
        const similarity = this.calculateSimilarity(
          customers[i],
          customers[j]
        )

        if (similarity > 0.8) {
          candidates.push(new DuplicateCandidate(
            customers[i].getId(),
            customers[j].getId(),
            similarity
          ))
        }
      }
    }

    return candidates
  }

  private calculateSimilarity(c1: Customer, c2: Customer): number {
    let score = 0

    // メールアドレスが同じ
    if (c1.getContactInfo().getEmail().equals(c2.getContactInfo().getEmail())) {
      score += 0.4
    }

    // 電話番号が同じ
    if (c1.getContactInfo().getPhone().equals(c2.getContactInfo().getPhone())) {
      score += 0.4
    }

    // 名前の類似度
    const nameSimilarity = this.calculateNameSimilarity(
      c1.getProfile(),
      c2.getProfile()
    )
    score += nameSimilarity * 0.2

    return score
  }
}
```

### リポジトリインターフェース

#### CustomerRepository
```typescript
interface CustomerRepository {
  // 基本的なCRUD操作
  save(customer: Customer): Promise<void>
  findById(id: CustomerId): Promise<Customer | null>
  delete(id: CustomerId): Promise<void>

  // ビジネスロジックのための検索
  findByEmail(email: Email): Promise<Customer | null>
  findByPhone(phone: PhoneNumber): Promise<Customer | null>

  findBySegment(segment: CustomerSegment): Promise<Customer[]>
  findByMembershipLevel(level: MembershipLevel): Promise<Customer[]>

  findByLastVisitDateRange(
    startDate: Date,
    endDate: Date
  ): Promise<Customer[]>

  findInactive(daysInactive: number): Promise<Customer[]>

  // 検索とフィルタリング
  search(criteria: CustomerSearchCriteria): Promise<Customer[]>

  // ページング
  findAll(page?: number, size?: number): Promise<Page<Customer>>
}
```

### 集約

#### CustomerAggregate
これは顧客集約の設計詳細

```typescript
// 集約ルート: Customer
// 集約境界内のエンティティ: Customer のみ

// 不変条件（Invariants）
class CustomerInvariants {
  // 1. メールアドレスは一意でなければならない
  static async ensureUniqueEmail(
    email: Email,
    customerId: CustomerId,
    repo: CustomerRepository
  ): Promise<void> {
    const existing = await repo.findByEmail(email)
    if (existing && !existing.getId().equals(customerId)) {
      throw new DuplicateEmailError()
    }
  }

  // 2. ポイント残高は負にならない
  static ensureSufficientPoints(
    currentPoints: number,
    usePoints: number
  ): void {
    if (usePoints > currentPoints) {
      throw new InsufficientPointsError()
    }
  }

  // 3. 会員レベルは適切なポイント数に基づく
  static ensureValidMembershipLevel(
    level: MembershipLevel,
    points: number
  ): void {
    const expectedLevel = MembershipLevel.calculateFromPoints(points)
    if (level !== expectedLevel) {
      throw new InvalidMembershipLevelError()
    }
  }
}
```

### ドメインイベント

```typescript
// 顧客登録イベント
class CustomerRegistered implements DomainEvent {
  constructor(
    public readonly customerId: CustomerId,
    public readonly email: Email,
    public readonly registeredAt: DateTime
  ) {}
}

// 顧客情報更新イベント
class CustomerProfileUpdated implements DomainEvent {
  constructor(
    public readonly customerId: CustomerId,
    public readonly changes: ProfileChanges,
    public readonly occurredAt: DateTime
  ) {}
}

// 会員レベル変更イベント
class MembershipLevelChanged implements DomainEvent {
  constructor(
    public readonly customerId: CustomerId,
    public readonly oldLevel: MembershipLevel,
    public readonly newLevel: MembershipLevel,
    public readonly occurredAt: DateTime
  ) {}
}

// 離反リスク検知イベント
class ChurnRiskDetected implements DomainEvent {
  constructor(
    public readonly customerId: CustomerId,
    public readonly daysSinceLastVisit: number,
    public readonly occurredAt: DateTime
  ) {}
}
```

## ユビキタス言語を作ってみる

| 用語 | 定義 | 実装での表現 |
|------|------|------------|
| 顧客（Customer） | サービスを利用する個人 | Customerエンティティ |
| 会員レベル（Membership Level） | ポイントに基づく顧客ランク | MembershipLevel列挙型 |
| 来店履歴（Visit History） | 過去の利用記録 | VisitRecord[] |
| 顧客セグメント（Customer Segment） | 行動パターンに基づく顧客分類 | CustomerSegment列挙型 |
| お気に入り（Favorite） | 顧客が好むメニューやスタッフ | CustomerPreferences |
| 離反リスク（Churn Risk） | 長期間来店していない状態 | ChurnRiskDetectedイベント |
| 顧客生涯価値（LTV） | 顧客が生涯にわたってもたらす価値 | calculateLifetimeValue() |

## コンテキスト間の連携について

### 予約管理コンテキストとの連携
- CustomerId値オブジェクトを共有
- 予約作成時の顧客情報参照
- 予約完了後の来店履歴記録

### 通知コンテキストとの連携（順応者パターン）について
- 顧客の連絡先情報提供
- 通知設定の管理

### 提供するサービス
1. **顧客情報API**
   - プロフィール情報の取得
   - 連絡先情報の取得
   - 嗜好情報の取得

2. **会員情報API**
   - 会員レベルの確認
   - ポイント残高の確認

### 必要な外部情報について
- 予約情報（予約管理コンテキストから）
- メニュー情報（メニューマスタから）
