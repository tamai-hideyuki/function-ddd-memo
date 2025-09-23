# 通知コンテキスト - ドメインモデル詳細設計

## コンテキスト概要
これは通知コンテキストは、システム全体の通知機能を担当する一般サブドメイン
メール、SMS、プッシュ通知などの各種通知チャネルを通じて、予約確認、リマインダー、プロモーション情報などを顧客に送信する

## ドメインモデル構成要素

### エンティティ

#### 1. Notification（通知）
これは通知を表す集約ルートエンティティ

```typescript
class Notification {
  private readonly id: NotificationId
  private recipientId: RecipientId
  private template: NotificationTemplate
  private channels: NotificationChannel[]
  private content: NotificationContent
  private schedule: NotificationSchedule
  private status: NotificationStatus
  private attempts: DeliveryAttempt[]
  private metadata: NotificationMetadata
  private readonly createdAt: DateTime
  private sentAt?: DateTime

  // ビジネスロジック
  send(): void {
    if (!this.canBeSent()) {
      throw new NotificationNotReadyError()
    }

    this.status = NotificationStatus.SENDING
    this.sentAt = DateTime.now()
  }

  markAsDelivered(channel: NotificationChannel): void {
    const attempt = this.getLatestAttemptForChannel(channel)
    if (!attempt) {
      throw new NoDeliveryAttemptError()
    }

    attempt.markAsDelivered()

    if (this.allChannelsDelivered()) {
      this.status = NotificationStatus.DELIVERED
    }
  }

  markAsFailed(channel: NotificationChannel, reason: string): void {
    const attempt = this.getLatestAttemptForChannel(channel)
    if (!attempt) {
      throw new NoDeliveryAttemptError()
    }

    attempt.markAsFailed(reason)

    if (this.shouldRetry(channel)) {
      this.scheduleRetry(channel)
    } else if (this.allChannelsFailed()) {
      this.status = NotificationStatus.FAILED
    }
  }

  addDeliveryAttempt(attempt: DeliveryAttempt): void {
    this.attempts.push(attempt)
  }

  cancel(): void {
    if (this.status === NotificationStatus.DELIVERED ||
        this.status === NotificationStatus.SENDING) {
      throw new CannotCancelNotificationError()
    }

    this.status = NotificationStatus.CANCELLED
  }

  private canBeSent(): boolean {
    return this.status === NotificationStatus.PENDING &&
           this.schedule.isTimeToSend()
  }

  private allChannelsDelivered(): boolean {
    return this.channels.every(channel =>
      this.getLatestAttemptForChannel(channel)?.isDelivered()
    )
  }

  private allChannelsFailed(): boolean {
    return this.channels.every(channel => {
      const attempt = this.getLatestAttemptForChannel(channel)
      return attempt?.isFailed() && !this.shouldRetry(channel)
    })
  }

  private shouldRetry(channel: NotificationChannel): boolean {
    const attempts = this.getAttemptsForChannel(channel)
    return attempts.length < channel.getMaxRetries()
  }

  private scheduleRetry(channel: NotificationChannel): void {
    const retryDelay = this.calculateRetryDelay(channel)
    this.schedule.updateNextSendTime(DateTime.now().plus(retryDelay))
  }

  private calculateRetryDelay(channel: NotificationChannel): Duration {
    const attemptCount = this.getAttemptsForChannel(channel).length
    // 指数バックオフ: 1分、2分、4分、8分...
    return Duration.minutes(Math.pow(2, attemptCount - 1))
  }

  private getLatestAttemptForChannel(channel: NotificationChannel): DeliveryAttempt | null {
    const channelAttempts = this.getAttemptsForChannel(channel)
    return channelAttempts.length > 0
      ? channelAttempts[channelAttempts.length - 1]
      : null
  }

  private getAttemptsForChannel(channel: NotificationChannel): DeliveryAttempt[] {
    return this.attempts.filter(a => a.getChannel().equals(channel))
  }
}
```

#### 2. NotificationTemplate（通知テンプレート）
これは通知の定型文を管理するエンティティ

```typescript
class NotificationTemplate {
  private readonly id: TemplateId
  private name: string
  private type: NotificationType
  private subject: TemplateString
  private body: TemplateString
  private channels: NotificationChannel[]
  private variables: TemplateVariable[]
  private isActive: boolean
  private version: number

  render(data: Map<string, any>): NotificationContent {
    this.validateRequiredVariables(data)

    const renderedSubject = this.renderTemplate(this.subject, data)
    const renderedBody = this.renderTemplate(this.body, data)

    return new NotificationContent(renderedSubject, renderedBody)
  }

  updateContent(subject: TemplateString, body: TemplateString): void {
    this.subject = subject
    this.body = body
    this.version++
  }

  activate(): void {
    this.isActive = true
  }

  deactivate(): void {
    this.isActive = false
  }

  private validateRequiredVariables(data: Map<string, any>): void {
    const requiredVariables = this.variables.filter(v => v.isRequired())

    for (const variable of requiredVariables) {
      if (!data.has(variable.getName())) {
        throw new MissingTemplateVariableError(variable.getName())
      }
    }
  }

  private renderTemplate(template: TemplateString, data: Map<string, any>): string {
    let rendered = template.getValue()

    for (const [key, value] of data) {
      const placeholder = `{{${key}}}`
      rendered = rendered.replace(new RegExp(placeholder, 'g'), value)
    }

    return rendered
  }
}
```

#### 3. NotificationCampaign（通知キャンペーン）
これは複数の通知を管理するエンティティ

```typescript
class NotificationCampaign {
  private readonly id: CampaignId
  private name: string
  private description: string
  private targetSegment: RecipientSegment
  private template: NotificationTemplate
  private schedule: CampaignSchedule
  private status: CampaignStatus
  private metrics: CampaignMetrics

  start(): void {
    if (this.status !== CampaignStatus.DRAFT) {
      throw new InvalidCampaignStatusError()
    }

    this.validateCampaignReadiness()
    this.status = CampaignStatus.RUNNING
  }

  pause(): void {
    if (this.status !== CampaignStatus.RUNNING) {
      throw new InvalidCampaignStatusError()
    }

    this.status = CampaignStatus.PAUSED
  }

  resume(): void {
    if (this.status !== CampaignStatus.PAUSED) {
      throw new InvalidCampaignStatusError()
    }

    this.status = CampaignStatus.RUNNING
  }

  complete(): void {
    this.status = CampaignStatus.COMPLETED
    this.metrics.finalize()
  }

  updateMetrics(event: NotificationEvent): void {
    this.metrics.recordEvent(event)
  }

  private validateCampaignReadiness(): void {
    if (!this.template.isActive()) {
      throw new InactiveTemplateError()
    }

    if (this.targetSegment.getRecipientCount() === 0) {
      throw new NoRecipientsError()
    }

    if (!this.schedule.isValid()) {
      throw new InvalidScheduleError()
    }
  }
}
```

### 値オブジェクト

#### 1. NotificationChannel（通知チャネル）
```typescript
class NotificationChannel {
  private readonly type: ChannelType
  private readonly config: ChannelConfig
  private readonly priority: number
  private readonly maxRetries: number

  constructor(
    type: ChannelType,
    config: ChannelConfig,
    priority: number = 1,
    maxRetries: number = 3
  ) {
    this.type = type
    this.config = config
    this.priority = priority
    this.maxRetries = maxRetries
  }

  isAvailable(): boolean {
    return this.config.isEnabled() && this.config.isConfigured()
  }

  getMaxRetries(): number {
    return this.maxRetries
  }

  equals(other: NotificationChannel): boolean {
    return this.type === other.type
  }
}

enum ChannelType {
  EMAIL = "EMAIL",
  SMS = "SMS",
  PUSH = "PUSH",
  IN_APP = "IN_APP",
  LINE = "LINE"
}

class ChannelConfig {
  constructor(
    private readonly settings: Map<string, string>,
    private readonly enabled: boolean = true
  ) {}

  isEnabled(): boolean {
    return this.enabled
  }

  isConfigured(): boolean {
    // チャネルタイプに応じた必須設定の確認
    return this.settings.size > 0
  }

  getSetting(key: string): string | undefined {
    return this.settings.get(key)
  }
}
```

#### 2. NotificationContent（通知内容）
```typescript
class NotificationContent {
  private readonly subject: string
  private readonly body: string
  private readonly attachments: Attachment[]
  private readonly metadata: Map<string, string>

  constructor(
    subject: string,
    body: string,
    attachments: Attachment[] = [],
    metadata: Map<string, string> = new Map()
  ) {
    this.validateContent(subject, body)
    this.subject = subject
    this.body = body
    this.attachments = attachments
    this.metadata = metadata
  }

  private validateContent(subject: string, body: string): void {
    if (!subject || subject.trim().length === 0) {
      throw new Error("Subject cannot be empty")
    }

    if (!body || body.trim().length === 0) {
      throw new Error("Body cannot be empty")
    }

    // 最大文字数制限
    if (subject.length > 200) {
      throw new Error("Subject too long")
    }

    if (body.length > 10000) {
      throw new Error("Body too long")
    }
  }

  getPlainText(): string {
    // HTMLタグを除去してプレーンテキストを返す
    return this.body.replace(/<[^>]*>/g, '')
  }

  getTotalSize(): number {
    const textSize = this.subject.length + this.body.length
    const attachmentSize = this.attachments.reduce(
      (sum, att) => sum + att.getSize(),
      0
    )
    return textSize + attachmentSize
  }
}

class Attachment {
  constructor(
    private readonly filename: string,
    private readonly contentType: string,
    private readonly data: Buffer,
    private readonly size: number
  ) {
    this.validateAttachment()
  }

  private validateAttachment(): void {
    const maxSize = 10 * 1024 * 1024 // 10MB

    if (this.size > maxSize) {
      throw new Error("Attachment too large")
    }

    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'text/plain'
    ]

    if (!allowedTypes.includes(this.contentType)) {
      throw new Error("Invalid attachment type")
    }
  }

  getSize(): number {
    return this.size
  }
}
```

#### 3. NotificationSchedule（通知スケジュール）
```typescript
class NotificationSchedule {
  private readonly scheduledTime: DateTime
  private readonly timeZone: TimeZone
  private readonly recurring?: RecurrencePattern
  private nextSendTime?: DateTime

  constructor(
    scheduledTime: DateTime,
    timeZone: TimeZone,
    recurring?: RecurrencePattern
  ) {
    this.scheduledTime = scheduledTime
    this.timeZone = timeZone
    this.recurring = recurring
    this.nextSendTime = scheduledTime
  }

  isTimeToSend(): boolean {
    const now = DateTime.now(this.timeZone)

    if (!this.nextSendTime) {
      return false
    }

    return now.isAfterOrEqual(this.nextSendTime)
  }

  updateNextSendTime(time: DateTime): void {
    this.nextSendTime = time
  }

  calculateNextOccurrence(): DateTime | null {
    if (!this.recurring) {
      return null
    }

    return this.recurring.getNextOccurrence(this.scheduledTime)
  }

  isWithinBusinessHours(): boolean {
    const hour = this.scheduledTime.getHourInTimeZone(this.timeZone)
    return hour >= 9 && hour < 20 // 9:00-20:00
  }
}

class RecurrencePattern {
  constructor(
    private readonly frequency: RecurrenceFrequency,
    private readonly interval: number,
    private readonly endDate?: Date
  ) {}

  getNextOccurrence(from: DateTime): DateTime | null {
    if (this.endDate && from.toDate().isAfter(this.endDate)) {
      return null
    }

    switch (this.frequency) {
      case RecurrenceFrequency.DAILY:
        return from.plusDays(this.interval)
      case RecurrenceFrequency.WEEKLY:
        return from.plusWeeks(this.interval)
      case RecurrenceFrequency.MONTHLY:
        return from.plusMonths(this.interval)
      default:
        return null
    }
  }
}

enum RecurrenceFrequency {
  DAILY = "DAILY",
  WEEKLY = "WEEKLY",
  MONTHLY = "MONTHLY"
}
```

#### 4. DeliveryAttempt（配信試行）
```typescript
class DeliveryAttempt {
  private readonly attemptId: string
  private readonly channel: NotificationChannel
  private readonly attemptedAt: DateTime
  private status: DeliveryStatus
  private response?: DeliveryResponse
  private errorMessage?: string

  constructor(channel: NotificationChannel) {
    this.attemptId = generateId()
    this.channel = channel
    this.attemptedAt = DateTime.now()
    this.status = DeliveryStatus.PENDING
  }

  markAsDelivered(response: DeliveryResponse): void {
    this.status = DeliveryStatus.DELIVERED
    this.response = response
  }

  markAsFailed(errorMessage: string): void {
    this.status = DeliveryStatus.FAILED
    this.errorMessage = errorMessage
  }

  markAsBounced(reason: string): void {
    this.status = DeliveryStatus.BOUNCED
    this.errorMessage = reason
  }

  isDelivered(): boolean {
    return this.status === DeliveryStatus.DELIVERED
  }

  isFailed(): boolean {
    return this.status === DeliveryStatus.FAILED ||
           this.status === DeliveryStatus.BOUNCED
  }

  getChannel(): NotificationChannel {
    return this.channel
  }
}

enum DeliveryStatus {
  PENDING = "PENDING",
  DELIVERED = "DELIVERED",
  FAILED = "FAILED",
  BOUNCED = "BOUNCED"
}

class DeliveryResponse {
  constructor(
    private readonly messageId: string,
    private readonly provider: string,
    private readonly timestamp: DateTime,
    private readonly metadata?: Map<string, any>
  ) {}

  getMessageId(): string {
    return this.messageId
  }
}
```

#### 5. NotificationPriority（通知優先度）
```typescript
enum NotificationPriority {
  URGENT = 1,    // 即座に送信（予約キャンセル等）
  HIGH = 2,      // 高優先度（予約確認等）
  NORMAL = 3,    // 通常（リマインダー等）
  LOW = 4        // 低優先度（プロモーション等）
}

class PriorityQueue {
  private queues: Map<NotificationPriority, Notification[]>

  constructor() {
    this.queues = new Map()
    for (const priority of Object.values(NotificationPriority)) {
      if (typeof priority === 'number') {
        this.queues.set(priority, [])
      }
    }
  }

  enqueue(notification: Notification, priority: NotificationPriority): void {
    const queue = this.queues.get(priority) || []
    queue.push(notification)
    this.queues.set(priority, queue)
  }

  dequeue(): Notification | null {
    for (const priority of [
      NotificationPriority.URGENT,
      NotificationPriority.HIGH,
      NotificationPriority.NORMAL,
      NotificationPriority.LOW
    ]) {
      const queue = this.queues.get(priority) || []
      if (queue.length > 0) {
        return queue.shift() || null
      }
    }
    return null
  }
}
```

### ドメインサービス

#### 1. NotificationDispatcher
これは通知の配信を管理するサービス

```typescript
class NotificationDispatcher {
  constructor(
    private notificationRepo: NotificationRepository,
    private channelProviders: Map<ChannelType, ChannelProvider>
  ) {}

  async dispatch(notification: Notification): Promise<void> {
    const channels = notification.getChannels()

    for (const channel of channels) {
      if (!channel.isAvailable()) {
        continue
      }

      const provider = this.channelProviders.get(channel.getType())
      if (!provider) {
        throw new ProviderNotConfiguredError(channel.getType())
      }

      try {
        const attempt = new DeliveryAttempt(channel)
        notification.addDeliveryAttempt(attempt)

        const response = await provider.send(
          notification.getRecipient(),
          notification.getContent(),
          channel.getConfig()
        )

        attempt.markAsDelivered(response)
        notification.markAsDelivered(channel)
      } catch (error) {
        notification.markAsFailed(channel, error.message)
      }
    }

    await this.notificationRepo.save(notification)
  }

  async batchDispatch(notifications: Notification[]): Promise<void> {
    // 優先度でソート
    const sorted = this.sortByPriority(notifications)

    // バッチサイズで分割
    const batches = this.createBatches(sorted, 100)

    for (const batch of batches) {
      await Promise.all(
        batch.map(notification => this.dispatch(notification))
      )
    }
  }

  private sortByPriority(notifications: Notification[]): Notification[] {
    return notifications.sort((a, b) =>
      a.getPriority() - b.getPriority()
    )
  }

  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = []

    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize))
    }

    return batches
  }
}
```

#### 2. NotificationPreferenceService
これは通知設定を管理するサービス

```typescript
class NotificationPreferenceService {
  constructor(
    private preferenceRepo: PreferenceRepository
  ) {}

  async getEffectiveChannels(
    recipientId: RecipientId,
    notificationType: NotificationType
  ): Promise<NotificationChannel[]> {
    const preferences = await this.preferenceRepo.findByRecipient(recipientId)

    if (!preferences) {
      return this.getDefaultChannels(notificationType)
    }

    const enabledChannels = preferences.getEnabledChannels(notificationType)

    // 配信時間制限の確認
    if (preferences.hasQuietHours() && this.isInQuietHours(preferences)) {
      return this.filterUrgentOnly(enabledChannels, notificationType)
    }

    return enabledChannels
  }

  async updatePreferences(
    recipientId: RecipientId,
    updates: PreferenceUpdate
  ): Promise<void> {
    let preferences = await this.preferenceRepo.findByRecipient(recipientId)

    if (!preferences) {
      preferences = new NotificationPreferences(recipientId)
    }

    preferences.apply(updates)
    await this.preferenceRepo.save(preferences)
  }

  private getDefaultChannels(type: NotificationType): NotificationChannel[] {
    // デフォルトのチャネル設定を返す
    switch (type) {
      case NotificationType.RESERVATION_CONFIRMATION:
        return [
          new NotificationChannel(ChannelType.EMAIL, new ChannelConfig(new Map())),
          new NotificationChannel(ChannelType.SMS, new ChannelConfig(new Map()))
        ]
      case NotificationType.REMINDER:
        return [
          new NotificationChannel(ChannelType.PUSH, new ChannelConfig(new Map()))
        ]
      default:
        return [
          new NotificationChannel(ChannelType.EMAIL, new ChannelConfig(new Map()))
        ]
    }
  }

  private isInQuietHours(preferences: NotificationPreferences): boolean {
    const now = DateTime.now()
    return preferences.isInQuietHours(now)
  }

  private filterUrgentOnly(
    channels: NotificationChannel[],
    type: NotificationType
  ): NotificationChannel[] {
    if (this.isUrgentType(type)) {
      return channels
    }
    return []
  }

  private isUrgentType(type: NotificationType): boolean {
    return type === NotificationType.RESERVATION_CANCELLATION ||
           type === NotificationType.URGENT_NOTICE
  }
}
```

### リポジトリインターフェース

#### NotificationRepository
```typescript
interface NotificationRepository {
  // 基本的なCRUD操作
  save(notification: Notification): Promise<void>
  findById(id: NotificationId): Promise<Notification | null>
  delete(id: NotificationId): Promise<void>

  // ビジネスロジックのための検索
  findPending(): Promise<Notification[]>
  findByRecipient(recipientId: RecipientId): Promise<Notification[]>
  findByStatus(status: NotificationStatus): Promise<Notification[]>

  findByDateRange(
    startDate: Date,
    endDate: Date
  ): Promise<Notification[]>

  findFailedForRetry(): Promise<Notification[]>

  // 統計情報
  countByStatusAndChannel(
    status: NotificationStatus,
    channel: ChannelType
  ): Promise<number>
}
```

#### TemplateRepository
```typescript
interface TemplateRepository {
  save(template: NotificationTemplate): Promise<void>
  findById(id: TemplateId): Promise<NotificationTemplate | null>
  findByType(type: NotificationType): Promise<NotificationTemplate[]>
  findActive(): Promise<NotificationTemplate[]>
}
```

### 集約

#### NotificationAggregate
これは通知集約の設計詳細

```typescript
// 集約ルート: Notification
// 集約境界内のエンティティ: Notification のみ

// 不変条件（Invariants）
class NotificationInvariants {
  // 1. 送信済みの通知はキャンセルできない
  static ensureCanBeCancelled(status: NotificationStatus): void {
    if (status === NotificationStatus.DELIVERED ||
        status === NotificationStatus.SENDING) {
      throw new CannotCancelNotificationError()
    }
  }

  // 2. 配信試行は設定された最大回数を超えない
  static ensureRetryLimit(
    attempts: DeliveryAttempt[],
    channel: NotificationChannel
  ): void {
    const channelAttempts = attempts.filter(a =>
      a.getChannel().equals(channel)
    )

    if (channelAttempts.length >= channel.getMaxRetries()) {
      throw new MaxRetriesExceededError()
    }
  }

  // 3. 通知は営業時間内に送信される（緊急を除く）
  static ensureBusinessHours(
    schedule: NotificationSchedule,
    priority: NotificationPriority
  ): void {
    if (priority === NotificationPriority.URGENT) {
      return
    }

    if (!schedule.isWithinBusinessHours()) {
      throw new OutsideBusinessHoursError()
    }
  }
}
```

### ドメインイベント

```typescript
// 通知送信イベント
class NotificationSent implements DomainEvent {
  constructor(
    public readonly notificationId: NotificationId,
    public readonly recipientId: RecipientId,
    public readonly channels: ChannelType[],
    public readonly occurredAt: DateTime
  ) {}
}

// 通知配信成功イベント
class NotificationDelivered implements DomainEvent {
  constructor(
    public readonly notificationId: NotificationId,
    public readonly channel: ChannelType,
    public readonly occurredAt: DateTime
  ) {}
}

// 通知配信失敗イベント
class NotificationFailed implements DomainEvent {
  constructor(
    public readonly notificationId: NotificationId,
    public readonly channel: ChannelType,
    public readonly reason: string,
    public readonly occurredAt: DateTime
  ) {}
}

// 通知バウンスイベント
class NotificationBounced implements DomainEvent {
  constructor(
    public readonly notificationId: NotificationId,
    public readonly channel: ChannelType,
    public readonly bounceType: BounceType,
    public readonly occurredAt: DateTime
  ) {}
}

enum BounceType {
  HARD = "HARD",   // 恒久的な配信失敗
  SOFT = "SOFT"    // 一時的な配信失敗
}
```

## ユビキタス言語を作ってみる

| 用語 | 定義 | 実装での表現 |
|------|------|------------|
| 通知（Notification） | システムから送信されるメッセージ | Notificationエンティティ |
| チャネル（Channel） | 通知を送る経路（メール、SMS等） | NotificationChannel値オブジェクト |
| テンプレート（Template） | 通知の定型文 | NotificationTemplateエンティティ |
| 配信試行（Delivery Attempt） | 通知送信の試み | DeliveryAttempt値オブジェクト |
| バウンス（Bounce） | 配信失敗で戻ってくること | NotificationBouncedイベント |
| 静寂時間（Quiet Hours） | 通知を送らない時間帯 | QuietHours値オブジェクト |
| キャンペーン（Campaign） | 複数の通知をまとめた配信計画 | NotificationCampaignエンティティ |

## コンテキスト間の連携は？

### 予約管理コンテキストとの連携
- 予約確認通知の送信
- 予約リマインダーの送信
- キャンセル通知の送信

### 顧客管理コンテキストとの連携（順応者パターン）について
- 顧客の連絡先情報取得
- 通知設定の管理

### 提供するサービスとは
1. **通知送信API**
   - 即時送信
   - スケジュール送信
   - バッチ送信

2. **配信状況API**
   - 配信ステータス確認
   - 配信履歴取得

### 外部サービスとの統合について
- メールサービス（SendGrid、Amazon SES等）
- SMSサービス（Twilio等）
- プッシュ通知サービス（Firebase Cloud Messaging等）
