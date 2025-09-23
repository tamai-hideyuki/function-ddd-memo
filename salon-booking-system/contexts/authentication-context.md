# 認証コンテキスト - ドメインモデル詳細設計

## コンテキスト概要
認証コンテキストは、システム全体の認証・認可機能を担当する一般サブドメイン
ユーザーのログイン、ログアウト、パスワード管理、権限管理などのセキュリティ関連機能を提供する

## ドメインモデル構成要素

### エンティティ

#### 1. User（ユーザー）
これは認証可能なユーザーを表す集約ルートエンティティ

```typescript
class User {
  private readonly id: UserId
  private credentials: Credentials
  private profile: UserProfile
  private roles: Role[]
  private accountStatus: AccountStatus
  private securitySettings: SecuritySettings
  private loginHistory: LoginRecord[]
  private readonly createdAt: DateTime
  private updatedAt: DateTime
  private lastLoginAt?: DateTime
  private failedLoginAttempts: number

  // ビジネスロジック
  authenticate(password: Password): AuthenticationResult {
    if (!this.isActive()) {
      return AuthenticationResult.accountLocked()
    }

    if (this.credentials.matches(password)) {
      this.recordSuccessfulLogin()
      return AuthenticationResult.success(this.generateToken())
    } else {
      this.recordFailedLogin()
      return AuthenticationResult.failure()
    }
  }

  changePassword(
    currentPassword: Password,
    newPassword: Password
  ): void {
    if (!this.credentials.matches(currentPassword)) {
      throw new InvalidCurrentPasswordError()
    }

    this.validatePasswordChange(newPassword)
    this.credentials = this.credentials.updatePassword(newPassword)
    this.securitySettings.recordPasswordChange()
    this.updatedAt = DateTime.now()
  }

  resetPassword(
    resetToken: ResetToken,
    newPassword: Password
  ): void {
    if (!this.securitySettings.validateResetToken(resetToken)) {
      throw new InvalidResetTokenError()
    }

    this.credentials = this.credentials.updatePassword(newPassword)
    this.securitySettings.invalidateResetToken()
    this.failedLoginAttempts = 0
    this.updatedAt = DateTime.now()
  }

  assignRole(role: Role): void {
    if (!this.hasRole(role)) {
      this.roles.push(role)
      this.updatedAt = DateTime.now()
    }
  }

  revokeRole(roleId: RoleId): void {
    this.roles = this.roles.filter(role => !role.getId().equals(roleId))
    this.updatedAt = DateTime.now()
  }

  enableTwoFactor(): void {
    const secret = this.securitySettings.generateTwoFactorSecret()
    this.securitySettings.enableTwoFactor(secret)
    this.updatedAt = DateTime.now()
  }

  disableTwoFactor(verificationCode: string): void {
    if (!this.securitySettings.verifyTwoFactorCode(verificationCode)) {
      throw new InvalidVerificationCodeError()
    }

    this.securitySettings.disableTwoFactor()
    this.updatedAt = DateTime.now()
  }

  lockAccount(reason: string): void {
    this.accountStatus = AccountStatus.LOCKED
    this.securitySettings.recordAccountLock(reason)
    this.updatedAt = DateTime.now()
  }

  unlockAccount(): void {
    this.accountStatus = AccountStatus.ACTIVE
    this.failedLoginAttempts = 0
    this.updatedAt = DateTime.now()
  }

  private isActive(): boolean {
    return this.accountStatus === AccountStatus.ACTIVE
  }

  private hasRole(role: Role): boolean {
    return this.roles.some(r => r.equals(role))
  }

  private recordSuccessfulLogin(): void {
    this.lastLoginAt = DateTime.now()
    this.failedLoginAttempts = 0
    this.loginHistory.push(new LoginRecord(
      DateTime.now(),
      LoginResult.SUCCESS
    ))
  }

  private recordFailedLogin(): void {
    this.failedLoginAttempts++
    this.loginHistory.push(new LoginRecord(
      DateTime.now(),
      LoginResult.FAILURE
    ))

    if (this.failedLoginAttempts >= 5) {
      this.lockAccount("Too many failed login attempts")
    }
  }

  private validatePasswordChange(newPassword: Password): void {
    if (this.securitySettings.wasRecentlyUsed(newPassword)) {
      throw new PasswordRecentlyUsedError()
    }

    if (this.credentials.matches(newPassword)) {
      throw new SamePasswordError()
    }
  }

  private generateToken(): AuthToken {
    return new AuthToken(
      this.id,
      this.roles,
      DateTime.now().plusHours(24)
    )
  }
}
```

#### 2. Role（ロール）
これは権限のグループを表すエンティティ

```typescript
class Role {
  private readonly id: RoleId
  private name: string
  private description: string
  private permissions: Permission[]
  private isSystemRole: boolean

  hasPermission(permission: Permission): boolean {
    return this.permissions.some(p => p.equals(permission))
  }

  grantPermission(permission: Permission): void {
    if (this.isSystemRole) {
      throw new CannotModifySystemRoleError()
    }

    if (!this.hasPermission(permission)) {
      this.permissions.push(permission)
    }
  }

  revokePermission(permissionId: PermissionId): void {
    if (this.isSystemRole) {
      throw new CannotModifySystemRoleError()
    }

    this.permissions = this.permissions.filter(
      p => !p.getId().equals(permissionId)
    )
  }

  canAccess(resource: Resource, action: Action): boolean {
    return this.permissions.some(permission =>
      permission.allows(resource, action)
    )
  }

  equals(other: Role): boolean {
    return this.id.equals(other.id)
  }

  getId(): RoleId {
    return this.id
  }
}
```

#### 3. Session（セッション）
これはユーザーのログインセッションを表すエンティティ

```typescript
class Session {
  private readonly id: SessionId
  private readonly userId: UserId
  private readonly token: SessionToken
  private readonly createdAt: DateTime
  private readonly expiresAt: DateTime
  private readonly ipAddress: IpAddress
  private readonly userAgent: string
  private lastActivityAt: DateTime
  private isRevoked: boolean

  isValid(): boolean {
    if (this.isRevoked) {
      return false
    }

    if (DateTime.now().isAfter(this.expiresAt)) {
      return false
    }

    // アイドルタイムアウト（30分）
    const idleTimeout = this.lastActivityAt.plusMinutes(30)
    if (DateTime.now().isAfter(idleTimeout)) {
      return false
    }

    return true
  }

  refresh(): Session {
    if (!this.isValid()) {
      throw new InvalidSessionError()
    }

    this.lastActivityAt = DateTime.now()
    return new Session(
      this.userId,
      this.ipAddress,
      this.userAgent,
      DateTime.now().plusHours(24)
    )
  }

  revoke(): void {
    this.isRevoked = true
  }

  updateActivity(): void {
    this.lastActivityAt = DateTime.now()
  }

  getRemainingTime(): Duration {
    return Duration.between(DateTime.now(), this.expiresAt)
  }
}
```

### 値オブジェクト

#### 1. Credentials（認証情報）
```typescript
class Credentials {
  private readonly username: Username
  private readonly passwordHash: PasswordHash
  private readonly salt: string

  constructor(username: Username, password: Password) {
    this.username = username
    this.salt = this.generateSalt()
    this.passwordHash = this.hashPassword(password, this.salt)
  }

  matches(password: Password): boolean {
    const hash = this.hashPassword(password, this.salt)
    return hash.equals(this.passwordHash)
  }

  updatePassword(newPassword: Password): Credentials {
    return new Credentials(this.username, newPassword)
  }

  private hashPassword(password: Password, salt: string): PasswordHash {
    // bcryptやArgon2などの安全なハッシュ関数を使用
    return PasswordHash.create(password, salt)
  }

  private generateSalt(): string {
    // 暗号学的に安全な乱数生成
    return crypto.randomBytes(32).toString('hex')
  }
}

class Username {
  private readonly value: string

  constructor(value: string) {
    this.validateFormat(value)
    this.value = value.toLowerCase()
  }

  private validateFormat(username: string): void {
    if (username.length < 3 || username.length > 30) {
      throw new Error("Username must be between 3 and 30 characters")
    }

    if (!username.match(/^[a-zA-Z0-9_-]+$/)) {
      throw new Error("Username contains invalid characters")
    }
  }

  equals(other: Username): boolean {
    return this.value === other.value
  }

  toString(): string {
    return this.value
  }
}

class Password {
  private readonly value: string

  constructor(value: string) {
    this.validateStrength(value)
    this.value = value
  }

  private validateStrength(password: string): void {
    if (password.length < 8) {
      throw new Error("Password must be at least 8 characters")
    }

    const hasUpperCase = /[A-Z]/.test(password)
    const hasLowerCase = /[a-z]/.test(password)
    const hasNumbers = /\d/.test(password)
    const hasSpecialChars = /[!@#$%^&*]/.test(password)

    const strength = [hasUpperCase, hasLowerCase, hasNumbers, hasSpecialChars]
      .filter(Boolean).length

    if (strength < 3) {
      throw new Error("Password is too weak")
    }
  }

  getValue(): string {
    return this.value
  }
}
```

#### 2. Permission（権限）
```typescript
class Permission {
  private readonly id: PermissionId
  private readonly resource: Resource
  private readonly actions: Action[]

  constructor(
    id: PermissionId,
    resource: Resource,
    actions: Action[]
  ) {
    this.id = id
    this.resource = resource
    this.actions = actions
  }

  allows(resource: Resource, action: Action): boolean {
    if (!this.resource.matches(resource)) {
      return false
    }

    return this.actions.includes(action) ||
           this.actions.includes(Action.ALL)
  }

  equals(other: Permission): boolean {
    return this.id.equals(other.id)
  }

  getId(): PermissionId {
    return this.id
  }
}

class Resource {
  private readonly type: ResourceType
  private readonly identifier?: string

  constructor(type: ResourceType, identifier?: string) {
    this.type = type
    this.identifier = identifier
  }

  matches(other: Resource): boolean {
    if (this.type !== other.type) {
      return false
    }

    // ワイルドカードマッチング
    if (!this.identifier || this.identifier === '*') {
      return true
    }

    return this.identifier === other.identifier
  }
}

enum ResourceType {
  RESERVATION = "RESERVATION",
  CUSTOMER = "CUSTOMER",
  STAFF = "STAFF",
  SCHEDULE = "SCHEDULE",
  REPORT = "REPORT"
}

enum Action {
  CREATE = "CREATE",
  READ = "READ",
  UPDATE = "UPDATE",
  DELETE = "DELETE",
  ALL = "*"
}
```

#### 3. AuthToken（認証トークン）
```typescript
class AuthToken {
  private readonly value: string
  private readonly userId: UserId
  private readonly roles: Role[]
  private readonly issuedAt: DateTime
  private readonly expiresAt: DateTime
  private readonly claims: Map<string, any>

  constructor(
    userId: UserId,
    roles: Role[],
    expiresAt: DateTime,
    claims: Map<string, any> = new Map()
  ) {
    this.userId = userId
    this.roles = roles
    this.issuedAt = DateTime.now()
    this.expiresAt = expiresAt
    this.claims = claims
    this.value = this.generateTokenValue()
  }

  isValid(): boolean {
    return DateTime.now().isBefore(this.expiresAt)
  }

  hasRole(roleName: string): boolean {
    return this.roles.some(role => role.getName() === roleName)
  }

  hasPermission(resource: Resource, action: Action): boolean {
    return this.roles.some(role =>
      role.canAccess(resource, action)
    )
  }

  getClaim(key: string): any {
    return this.claims.get(key)
  }

  private generateTokenValue(): string {
    // JWT形式でトークンを生成
    const payload = {
      sub: this.userId.toString(),
      roles: this.roles.map(r => r.getName()),
      iat: this.issuedAt.toUnixTimestamp(),
      exp: this.expiresAt.toUnixTimestamp(),
      ...Object.fromEntries(this.claims)
    }

    return jwt.sign(payload, process.env.JWT_SECRET)
  }

  static fromString(tokenString: string): AuthToken {
    try {
      const payload = jwt.verify(tokenString, process.env.JWT_SECRET)
      // payloadからAuthTokenを再構築
      return new AuthToken(/* ... */)
    } catch (error) {
      throw new InvalidTokenError()
    }
  }
}
```

#### 4. SecuritySettings（セキュリティ設定）
```typescript
class SecuritySettings {
  private twoFactorEnabled: boolean
  private twoFactorSecret?: string
  private passwordHistory: PasswordHash[]
  private resetToken?: ResetToken
  private lastPasswordChange: DateTime
  private accountLocks: AccountLockRecord[]

  enableTwoFactor(secret: string): void {
    this.twoFactorEnabled = true
    this.twoFactorSecret = secret
  }

  disableTwoFactor(): void {
    this.twoFactorEnabled = false
    this.twoFactorSecret = undefined
  }

  verifyTwoFactorCode(code: string): boolean {
    if (!this.twoFactorEnabled || !this.twoFactorSecret) {
      return false
    }

    // TOTPアルゴリズムでコード検証
    return totp.verify(code, this.twoFactorSecret)
  }

  generateTwoFactorSecret(): string {
    return speakeasy.generateSecret().base32
  }

  generateResetToken(): ResetToken {
    this.resetToken = new ResetToken()
    return this.resetToken
  }

  validateResetToken(token: ResetToken): boolean {
    if (!this.resetToken) {
      return false
    }

    return this.resetToken.equals(token) && this.resetToken.isValid()
  }

  invalidateResetToken(): void {
    this.resetToken = undefined
  }

  recordPasswordChange(): void {
    this.lastPasswordChange = DateTime.now()
  }

  wasRecentlyUsed(password: Password): boolean {
    // 最近使用した5つのパスワードと比較
    const recentPasswords = this.passwordHistory.slice(-5)
    return recentPasswords.some(hash =>
      hash.matches(password)
    )
  }

  recordAccountLock(reason: string): void {
    this.accountLocks.push(new AccountLockRecord(
      DateTime.now(),
      reason
    ))
  }

  requiresPasswordChange(): boolean {
    const daysSinceChange = DateTime.daysBetween(
      this.lastPasswordChange,
      DateTime.now()
    )
    return daysSinceChange > 90 // 90日でパスワード変更を要求
  }
}

class ResetToken {
  private readonly value: string
  private readonly expiresAt: DateTime

  constructor() {
    this.value = this.generateSecureToken()
    this.expiresAt = DateTime.now().plusHours(1)
  }

  isValid(): boolean {
    return DateTime.now().isBefore(this.expiresAt)
  }

  equals(other: ResetToken): boolean {
    return this.value === other.value
  }

  private generateSecureToken(): string {
    return crypto.randomBytes(32).toString('hex')
  }
}
```

#### 5. AccountStatus（アカウント状態）
```typescript
enum AccountStatus {
  PENDING = "PENDING",       // 登録確認待ち
  ACTIVE = "ACTIVE",         // アクティブ
  SUSPENDED = "SUSPENDED",   // 一時停止
  LOCKED = "LOCKED",         // ロック
  DELETED = "DELETED"        // 削除済み
}

class AccountStatusTransition {
  private static readonly transitions = {
    [AccountStatus.PENDING]: [AccountStatus.ACTIVE, AccountStatus.DELETED],
    [AccountStatus.ACTIVE]: [AccountStatus.SUSPENDED, AccountStatus.LOCKED, AccountStatus.DELETED],
    [AccountStatus.SUSPENDED]: [AccountStatus.ACTIVE, AccountStatus.DELETED],
    [AccountStatus.LOCKED]: [AccountStatus.ACTIVE, AccountStatus.DELETED],
    [AccountStatus.DELETED]: []
  }

  static canTransition(from: AccountStatus, to: AccountStatus): boolean {
    const allowedTransitions = this.transitions[from] || []
    return allowedTransitions.includes(to)
  }

  static validate(from: AccountStatus, to: AccountStatus): void {
    if (!this.canTransition(from, to)) {
      throw new InvalidStatusTransitionError(from, to)
    }
  }
}
```

### ドメインサービス

#### 1. AuthenticationService
これは認証処理を行うサービス

```typescript
class AuthenticationService {
  constructor(
    private userRepo: UserRepository,
    private sessionRepo: SessionRepository,
    private eventPublisher: EventPublisher
  ) {}

  async login(
    username: Username,
    password: Password,
    ipAddress: IpAddress,
    userAgent: string
  ): Promise<LoginResult> {
    const user = await this.userRepo.findByUsername(username)

    if (!user) {
      // タイミング攻撃を防ぐため、存在しないユーザーでも同じ時間をかける
      await this.simulatePasswordCheck()
      return LoginResult.failure("Invalid credentials")
    }

    const authResult = user.authenticate(password)

    if (!authResult.isSuccess()) {
      await this.userRepo.save(user)
      this.eventPublisher.publish(new LoginFailed(
        user.getId(),
        DateTime.now(),
        ipAddress
      ))
      return LoginResult.failure(authResult.getReason())
    }

    // 二要素認証が有効な場合
    if (user.hasTwoFactorEnabled()) {
      return LoginResult.requiresTwoFactor(user.getId())
    }

    const session = new Session(
      user.getId(),
      ipAddress,
      userAgent,
      DateTime.now().plusHours(24)
    )

    await this.sessionRepo.save(session)
    await this.userRepo.save(user)

    this.eventPublisher.publish(new LoginSucceeded(
      user.getId(),
      DateTime.now(),
      ipAddress
    ))

    return LoginResult.success(session.getToken())
  }

  async verifyTwoFactor(
    userId: UserId,
    code: string
  ): Promise<LoginResult> {
    const user = await this.userRepo.findById(userId)

    if (!user || !user.verifyTwoFactorCode(code)) {
      return LoginResult.failure("Invalid verification code")
    }

    const session = new Session(
      user.getId(),
      IpAddress.unknown(),
      "unknown",
      DateTime.now().plusHours(24)
    )

    await this.sessionRepo.save(session)

    return LoginResult.success(session.getToken())
  }

  async logout(sessionToken: SessionToken): Promise<void> {
    const session = await this.sessionRepo.findByToken(sessionToken)

    if (session) {
      session.revoke()
      await this.sessionRepo.save(session)

      this.eventPublisher.publish(new LogoutCompleted(
        session.getUserId(),
        DateTime.now()
      ))
    }
  }

  async refreshSession(
    sessionToken: SessionToken
  ): Promise<RefreshResult> {
    const session = await this.sessionRepo.findByToken(sessionToken)

    if (!session || !session.isValid()) {
      return RefreshResult.failure()
    }

    const newSession = session.refresh()
    await this.sessionRepo.save(newSession)

    // 古いセッションを無効化
    session.revoke()
    await this.sessionRepo.save(session)

    return RefreshResult.success(newSession.getToken())
  }

  private async simulatePasswordCheck(): Promise<void> {
    // タイミング攻撃を防ぐための疑似処理
    await new Promise(resolve => setTimeout(resolve, 100))
  }
}
```

#### 2. AuthorizationService
これは認可処理を行うサービス

```typescript
class AuthorizationService {
  constructor(
    private userRepo: UserRepository,
    private roleRepo: RoleRepository
  ) {}

  async authorize(
    userId: UserId,
    resource: Resource,
    action: Action
  ): Promise<boolean> {
    const user = await this.userRepo.findById(userId)

    if (!user || !user.isActive()) {
      return false
    }

    // スーパー管理者は全権限を持つ
    if (user.hasRole("SUPER_ADMIN")) {
      return true
    }

    // 各ロールの権限をチェック
    for (const role of user.getRoles()) {
      if (role.canAccess(resource, action)) {
        return true
      }
    }

    return false
  }

  async getUserPermissions(userId: UserId): Promise<Permission[]> {
    const user = await this.userRepo.findById(userId)

    if (!user) {
      return []
    }

    const permissions: Permission[] = []

    for (const role of user.getRoles()) {
      permissions.push(...role.getPermissions())
    }

    // 重複を除去
    return this.uniquePermissions(permissions)
  }

  async checkPolicy(
    userId: UserId,
    policy: Policy
  ): Promise<PolicyResult> {
    const user = await this.userRepo.findById(userId)

    if (!user) {
      return PolicyResult.deny("User not found")
    }

    return policy.evaluate(user)
  }

  private uniquePermissions(permissions: Permission[]): Permission[] {
    const seen = new Set<string>()
    const unique: Permission[] = []

    for (const permission of permissions) {
      const key = permission.getId().toString()
      if (!seen.has(key)) {
        seen.add(key)
        unique.push(permission)
      }
    }

    return unique
  }
}
```

### リポジトリインターフェース

#### UserRepository
```typescript
interface UserRepository {
  // 基本的なCRUD操作
  save(user: User): Promise<void>
  findById(id: UserId): Promise<User | null>
  delete(id: UserId): Promise<void>

  // ビジネスロジックのための検索
  findByUsername(username: Username): Promise<User | null>
  findByEmail(email: Email): Promise<User | null>

  findByRole(roleId: RoleId): Promise<User[]>
  findByStatus(status: AccountStatus): Promise<User[]>

  findInactiveUsers(days: number): Promise<User[]>
  findUsersRequiringPasswordChange(): Promise<User[]>

  // 統計情報
  countByStatus(status: AccountStatus): Promise<number>
  countActiveSessionsByUser(userId: UserId): Promise<number>
}
```

#### SessionRepository
```typescript
interface SessionRepository {
  save(session: Session): Promise<void>
  findById(id: SessionId): Promise<Session | null>
  findByToken(token: SessionToken): Promise<Session | null>
  findByUserId(userId: UserId): Promise<Session[]>

  deleteExpired(): Promise<number>
  deleteByUserId(userId: UserId): Promise<void>
}
```

### 集約

#### UserAggregate
これはユーザー集約の設計詳細

```typescript
// 集約ルート: User
// 集約境界内のエンティティ: User のみ

// 不変条件（Invariants）
class UserInvariants {
  // 1. ユーザー名は一意でなければならない
  static async ensureUniqueUsername(
    username: Username,
    userId: UserId,
    repo: UserRepository
  ): Promise<void> {
    const existing = await repo.findByUsername(username)
    if (existing && !existing.getId().equals(userId)) {
      throw new DuplicateUsernameError()
    }
  }

  // 2. パスワード変更は適切な認証後のみ可能
  static ensurePasswordChangeAuthorized(
    currentPasswordMatch: boolean
  ): void {
    if (!currentPasswordMatch) {
      throw new UnauthorizedPasswordChangeError()
    }
  }

  // 3. アカウント状態の遷移は定められたルールに従う
  static ensureValidStatusTransition(
    from: AccountStatus,
    to: AccountStatus
  ): void {
    AccountStatusTransition.validate(from, to)
  }

  // 4. ロールの重複は許可しない
  static ensureNoDuplicateRoles(roles: Role[]): void {
    const roleIds = new Set<string>()
    for (const role of roles) {
      const id = role.getId().toString()
      if (roleIds.has(id)) {
        throw new DuplicateRoleError()
      }
      roleIds.add(id)
    }
  }
}
```

### ドメインイベント

```typescript
// ログイン成功イベント
class LoginSucceeded implements DomainEvent {
  constructor(
    public readonly userId: UserId,
    public readonly occurredAt: DateTime,
    public readonly ipAddress: IpAddress
  ) {}
}

// ログイン失敗イベント
class LoginFailed implements DomainEvent {
  constructor(
    public readonly userId: UserId,
    public readonly occurredAt: DateTime,
    public readonly ipAddress: IpAddress,
    public readonly reason?: string
  ) {}
}

// パスワード変更イベント
class PasswordChanged implements DomainEvent {
  constructor(
    public readonly userId: UserId,
    public readonly occurredAt: DateTime
  ) {}
}

// アカウントロックイベント
class AccountLocked implements DomainEvent {
  constructor(
    public readonly userId: UserId,
    public readonly reason: string,
    public readonly occurredAt: DateTime
  ) {}
}

// ロール変更イベント
class RoleAssigned implements DomainEvent {
  constructor(
    public readonly userId: UserId,
    public readonly roleId: RoleId,
    public readonly occurredAt: DateTime
  ) {}
}
```

## ユビキタス言語を作ってみる

| 用語 | 定義 | 実装での表現 |
|------|------|------------|
| ユーザー（User） | システムにアクセスする個人 | Userエンティティ |
| 認証（Authentication） | ユーザーの身元確認 | AuthenticationService |
| 認可（Authorization） | リソースへのアクセス権限確認 | AuthorizationService |
| ロール（Role） | 権限のグループ | Roleエンティティ |
| 権限（Permission） | 特定の操作を行う許可 | Permission値オブジェクト |
| セッション（Session） | ログイン状態の管理単位 | Sessionエンティティ |
| 二要素認証（2FA） | 追加の認証手段 | SecuritySettings |
| トークン（Token） | 認証情報の証明 | AuthToken値オブジェクト |

## コンテキスト間の連携について

### 全コンテキストとの連携（公開ホストサービス）
- 認証APIの提供
- 認可APIの提供
- セッション管理

### 提供するサービスについて
1. **認証API**
   - ログイン/ログアウト
   - パスワードリセット
   - 二要素認証

2. **認可API**
   - 権限チェック
   - ロール管理

3. **セッション管理API**
   - セッション検証
   - セッションリフレッシュ

### セキュリティ考慮事項について
- パスワードの安全なハッシュ化（bcrypt/Argon2）
- タイミング攻撃への対策
- ブルートフォース攻撃への対策
- セッション固定攻撃への対策
- CSRF対策
- XSS対策
