# Testing Requirements

## テスト方針

タスクの規模に応じてテスト戦略を選択する。すべてに一律TDDを強制しない。

### 本格的な機能開発（TDD推奨）
- 新機能、複雑なロジック、リグレッションリスクが高い変更
- RED → GREEN → REFACTOR のサイクルを推奨
- カバレッジ目標: 80%+

### 軽量な変更（テスト任意）
- 設定変更、ドキュメント更新、UIの微調整
- プロトタイピング・探索的開発
- 既存テストが通ることを確認すれば十分

## テストの種類

プロジェクトの性質に応じて適切な組み合わせを選択:
1. **Unit Tests** - ロジック・ユーティリティ
2. **Integration Tests** - API・DB操作
3. **E2E Tests** - クリティカルなユーザーフロー（Playwright）

すべてを常に必須とはしない。ユーザーの指示やプロジェクト規模に応じて判断する。

## Troubleshooting Test Failures

1. Check test isolation
2. Verify mocks are correct
3. Fix implementation, not tests (unless tests are wrong)
4. 必要に応じて **tdd-guide** agent を使用
