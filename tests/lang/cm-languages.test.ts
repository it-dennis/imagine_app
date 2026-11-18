import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { ensureSyntaxTree } from '@codemirror/language'
import { asmLanguage, basicLanguage, MNEMONICS } from '../../src/renderer/lib/lang/cm-languages'

// A stream parser that fails to advance throws inside CodeMirror and aborts the update, which once left the
// document state stale. Typing character by character produces every prefix, so check all prefixes.
const SAMPLES = [
  '10 print "hello {clr}"\n20 goto 10',
  '10 rem {clr',
  '10 data 1,"a{$',
  '10 print "x{',
  '30 poke 53280,0:sys 49152 : ? \u03c0',
  '{',
  '"',
]

describe('syntax parsers always advance', () => {
  for (const id of ['v2', 'v35', 'v70'] as const) {
    it(`BASIC ${id}: every typed prefix parses`, () => {
      for (const sample of SAMPLES) {
        for (let n = 0; n <= sample.length; n++) {
          const state = EditorState.create({ doc: sample.slice(0, n), extensions: [basicLanguage(id)] })
          expect(() => ensureSyntaxTree(state, state.doc.length, 5000)).not.toThrow()
        }
      }
    })
  }

  it('assembler: every typed prefix parses', () => {
    const asm = ['* = $0801\nstart: lda #$00 ; clear\n  sta $d020,x\n.byte "x\\"y", 1', '!byte $', "lda #'", 'label:', '.', '%', '$']
    for (const sample of asm) {
      for (let n = 0; n <= sample.length; n++) {
        const state = EditorState.create({ doc: sample.slice(0, n), extensions: [asmLanguage] })
        expect(() => ensureSyntaxTree(state, state.doc.length, 5000)).not.toThrow()
      }
    }
  })
})

describe('mnemonic list', () => {
  it('has the 56 documented 6502 instructions', () => {
    expect(MNEMONICS.size).toBe(56)
  })
})
