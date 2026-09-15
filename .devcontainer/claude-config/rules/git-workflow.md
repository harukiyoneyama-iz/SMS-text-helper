# Git Workflow

## Commit Message Format

```
<type>: <description>

<optional body>
```

Types: feat, fix, refactor, docs, test, chore, perf, ci

Note: Attribution disabled globally via ~/.claude/settings.json.

## Pull Request Workflow

When creating PRs:
1. Analyze full commit history (not just latest commit)
2. Use `git diff [base-branch]...HEAD` to see all changes
3. Draft comprehensive PR summary
4. Include test plan with TODOs
5. Push with `-u` flag if new branch

## コミット頻度

こまめなコミットを心がける。ただし作業を中断してまで提案しない。

**コミットの目安:**
- Phase/タスクの区切りが付いたとき
- テストが通る安定した状態になったとき
- 大きな変更の前（ロールバックポイント確保）

**禁止:** Phase全体や複数機能をまとめて1コミットにすること。

**重要:** ユーザーが集中作業中に頻繁にコミット提案をしない。自然な区切りで提案する。明示的に「コミットして」と言われたら即実行。

## Feature Implementation Workflow

1. **Plan First** - 実装方針を整理し、必要に応じてPlanモードを使用
2. **Implement** - テスト方針はtesting.mdに従う
3. **Code Review** - review-workflow.md に従い、コミット前レビューは Claude が自発的に実施
4. **Commit** - conventional commits形式で区切りごとにコミット
