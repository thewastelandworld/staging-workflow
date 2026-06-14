import { describe, it, expect } from 'vitest'
import { translations } from '../i18n'

describe('i18n', () => {
  it('all locales have the same keys', () => {
    const jaKeys = Object.keys(translations.ja).sort()
    for (const locale of ['en', 'zh'] as const) {
      expect(Object.keys(translations[locale]).sort()).toEqual(jaKeys)
    }
  })

  describe('overdueCount', () => {
    it('ja', () => expect(translations.ja.overdueCount(3)).toBe('🔴 3件超過'))
    it('en', () => expect(translations.en.overdueCount(1)).toBe('🔴 1 overdue'))
    it('zh', () => expect(translations.zh.overdueCount(2)).toBe('🔴 2项逾期'))
  })

  describe('problemCount', () => {
    it('ja', () => expect(translations.ja.problemCount(2)).toBe('🚨 問題2件'))
    it('en singular', () => expect(translations.en.problemCount(1)).toBe('🚨 1 issue'))
    it('en plural', () => expect(translations.en.problemCount(2)).toBe('🚨 2 issues'))
    it('zh', () => expect(translations.zh.problemCount(3)).toBe('🚨 3个问题'))
  })

  describe('stagesLabel', () => {
    it('ja', () => expect(translations.ja.stagesLabel(1)).toBe('1ステージ'))
    it('en singular', () => expect(translations.en.stagesLabel(1)).toBe('1 stage'))
    it('en plural', () => expect(translations.en.stagesLabel(2)).toBe('2 stages'))
    it('zh', () => expect(translations.zh.stagesLabel(3)).toBe('3个阶段'))
  })

  describe('completedLabel', () => {
    it('ja', () => expect(translations.ja.completedLabel(5)).toBe('✓ 完了: 5'))
    it('en', () => expect(translations.en.completedLabel(0)).toBe('✓ Done: 0'))
    it('zh', () => expect(translations.zh.completedLabel(2)).toBe('✓ 完成: 2'))
  })

  describe('overdueLabel', () => {
    it('ja', () => expect(translations.ja.overdueLabel(1)).toBe('🔴 期限超過: 1件'))
    it('en', () => expect(translations.en.overdueLabel(2)).toBe('🔴 Overdue: 2'))
    it('zh', () => expect(translations.zh.overdueLabel(3)).toBe('🔴 逾期: 3项'))
  })

  describe('restartConfirm', () => {
    it('includes stage name in all locales', () => {
      expect(translations.ja.restartConfirm('テスト')).toContain('テスト')
      expect(translations.en.restartConfirm('Test')).toContain('Test')
      expect(translations.zh.restartConfirm('测试')).toContain('测试')
    })
  })

  describe('membersCount', () => {
    it('ja', () => expect(translations.ja.membersCount(3)).toBe('3名'))
    it('en singular', () => expect(translations.en.membersCount(1)).toBe('1 member'))
    it('en plural', () => expect(translations.en.membersCount(2)).toBe('2 members'))
    it('zh', () => expect(translations.zh.membersCount(5)).toBe('5名'))
  })

  describe('csvImportBtnLabel', () => {
    it('ja', () => expect(translations.ja.csvImportBtnLabel(5)).toBe('5件をインポート'))
    it('en singular', () => expect(translations.en.csvImportBtnLabel(1)).toBe('Import 1 stage'))
    it('en plural', () => expect(translations.en.csvImportBtnLabel(3)).toBe('Import 3 stages'))
    it('zh', () => expect(translations.zh.csvImportBtnLabel(2)).toBe('导入2个阶段'))
  })

  describe('bulkEditSaveBtn', () => {
    it('ja', () => expect(translations.ja.bulkEditSaveBtn(4)).toBe('4件を一括保存'))
    it('en singular', () => expect(translations.en.bulkEditSaveBtn(1)).toBe('Save 1 stage'))
    it('en plural', () => expect(translations.en.bulkEditSaveBtn(3)).toBe('Save 3 stages'))
    it('zh', () => expect(translations.zh.bulkEditSaveBtn(2)).toBe('批量保存2个阶段'))
  })

  describe('bulkEditDone', () => {
    it('ja', () => expect(translations.ja.bulkEditDone(3)).toBe('3件を更新しました'))
    it('en singular', () => expect(translations.en.bulkEditDone(1)).toBe('Updated 1 stage'))
    it('en plural', () => expect(translations.en.bulkEditDone(5)).toBe('Updated 5 stages'))
    it('zh', () => expect(translations.zh.bulkEditDone(2)).toBe('已更新2个阶段'))
  })
})
