# アーキテクチャ設計

## アーキテクチャパターン
ヘキサゴナルアーキテクチャ（ポートとアダプター）を採用した

## ディレクトリ構造

```
salon-booking-system/
├── README.md
├── domain-model.md
├── architecture.md
└── src/
    ├── core/                      # 中核サブドメインはここ
    │   └── reservation/
    │       ├── domain/
    │       │   ├── model/
    │       │   │   ├── reservation.ts
    │       │   │   ├── reservation-id.ts
    │       │   │   ├── time-slot.ts
    │       │   │   └── reservation-status.ts
    │       │   ├── service/
    │       │   │   └── reservation-service.ts
    │       │   └── repository/
    │       │       └── reservation-repository.ts
    │       ├── application/
    │       │   ├── use-case/
    │       │   │   ├── create-reservation.ts
    │       │   │   ├── cancel-reservation.ts
    │       │   │   └── confirm-reservation.ts
    │       │   └── port/
    │       │       ├── in/
    │       │       │   └── reservation-use-case.ts
    │       │       └── out/
    │       │           ├── load-reservation-port.ts
    │       │           └── save-reservation-port.ts
    │       └── infrastructure/
    │           ├── adapter/
    │           │   ├── in/
    │           │   │   └── web/
    │           │   │       └── reservation-controller.ts
    │           │   └── out/
    │           │       └── persistence/
    │           │           └── reservation-repository-impl.ts
    │           └── config/
    │               └── reservation-config.ts
    │
    ├── supporting/                # 支援サブドメインはここ
    │   ├── schedule/
    │   │   ├── domain/
    │   │   ├── application/
    │   │   └── infrastructure/
    │   └── customer/
    │       ├── domain/
    │       ├── application/
    │       └── infrastructure/
    │
    └── generic/                   # 一般サブドメインはここ
        ├── auth/
        │   ├── domain/
        │   ├── application/
        │   └── infrastructure/
        └── notification/
            ├── domain/
            ├── application/
            └── infrastructure/
```

## レイヤーの責務について

### Domain層
- **責務**: ビジネスルールとドメイン知識の表現
- **含むもの**: エンティティ、値オブジェクト、ドメインサービス、リポジトリインターフェース
- **依存**: なし（最も内側の層）

### Application層
- **責務**: ユースケースの実装、トランザクション境界の管理
- **含むもの**: ユースケース、アプリケーションサービス、ポート定義
- **依存**: Domain層のみ

### Infrastructure層
- **責務**: 技術的な詳細の実装
- **含むもの**: Webコントローラー、DBアクセス実装、外部API連携
- **依存**: Application層、Domain層

## ポートとアダプターの設計について

### 入力ポート（Driving Port）
```typescript
// 予約作成のユースケース
interface CreateReservationUseCase {
  execute(command: CreateReservationCommand): Promise<ReservationDto>
}

interface CreateReservationCommand {
  customerId: string
  staffId: string
  menuId: string
  date: string
  startTime: string
}
```

### 出力ポート（Driven Port）
```typescript
// 予約の永続化
interface SaveReservationPort {
  save(reservation: Reservation): Promise<void>
}

// 予約の取得
interface LoadReservationPort {
  findById(id: ReservationId): Promise<Reservation | null>
  findByStaffAndTimeSlot(staffId: StaffId, timeSlot: TimeSlot): Promise<Reservation[]>
}
```

### アダプター
```typescript
// Webアダプター（入力）
class ReservationController {
  constructor(private createReservation: CreateReservationUseCase) {}

  async post(req: Request): Promise<Response> {
    const command = this.mapToCommand(req.body)
    const result = await this.createReservation.execute(command)
    return Response.ok(result)
  }
}

// DBアダプター（出力）
class ReservationRepositoryImpl implements SaveReservationPort, LoadReservationPort {
  async save(reservation: Reservation): Promise<void> {
    // ORMを使った永続化処理
  }

  async findById(id: ReservationId): Promise<Reservation | null> {
    // ORMを使った検索処理
  }
}
```

## 依存関係の方向について

```
[Controller] → [UseCase] → [Domain Model]
                    ↓            ↑
            [Repository Interface]
                    ↑
            [Repository Impl]
```

- 依存の方向は常に内側（ドメイン）に向かうこと
- 外側の層は内側の層を知っているが、内側は外側を知らないこと
- インターフェースを通じて依存性の逆転を実現する

## テスト戦略について

### 単体テスト
- **Domain層**: ビジネスルールのテスト（値オブジェクト、エンティティ）
- **Application層**: ユースケースのテスト（モックを使用）

### 統合テスト
- **Infrastructure層**: DBアクセス、外部API連携のテスト

### E2Eテスト
- 主要なユーザーシナリオの動作確認

## 実装の優先順位についてまとめる

1. **第1フェーズ**: 中核サブドメイン（予約管理）のドメインモデル
2. **第2フェーズ**: 予約作成のユースケース
3. **第3フェーズ**: 最小限のWebAPIとDB永続化
4. **第4フェーズ**: 支援サブドメインの追加
