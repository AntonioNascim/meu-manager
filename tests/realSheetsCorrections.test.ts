import { describe, expect, it } from 'vitest'
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isTaskDone, interpretTask, loadCorrections, mergeCorrection, patchSheet, readSheet, readTaskSheet, saveCorrections } from '../tools/realdata/corrections'
import type { Correction } from '../tools/realdata/corrections'
import { parseCsv } from '../src/data/package/edit/csv'

const entries = (campo: string, value: string): { field: string; value: string }[] => {
  const r = interpretTask(campo, value)
  if (!r.ok) throw new Error(r.reason)
  return r.entries
}
const reason = (campo: string, value: string): string => {
  const r = interpretTask(campo, value)
  return r.ok ? '' : r.reason
}

describe('tarefas feitas: valores', () => {
  it('posição: sigla do jogo, rótulo da interface e secundárias', () => {
    expect(entries('posição', 'ZAG')).toEqual([{ field: 'position', value: 'CB' }])
    expect(entries('Posicao', 'st')).toEqual([{ field: 'position', value: 'ST' }])
    expect(entries('posição', 'LD / PD, MEI')).toEqual([{ field: 'position', value: 'RB' }, { field: 'secondaryPositions', value: 'RW|AM' }])
    expect(reason('posição', 'XYZ')).toMatch(/não é uma posição/)
    expect(reason('posição', 'CB CM AM ST')).toMatch(/no máximo 2/)
    expect(reason('posição', 'GOL ZAG')).toMatch(/goleiro/)
    expect(reason('posição', 'ZAG GOL')).toMatch(/goleiro/)
  })

  it('cores, capacidade, cidade, estádio, força e potencial', () => {
    expect(entries('cor 2', 'FFF')).toEqual([{ field: 'color2', value: '#ffffff' }])
    expect(entries('cores', '#CC0000 #fff')).toEqual([{ field: 'color1', value: '#cc0000' }, { field: 'color2', value: '#ffffff' }])
    expect(reason('cores', '#cc0000')).toMatch(/duas cores/)
    expect(reason('cor 2', 'vermelho')).toMatch(/não é uma cor/)
    expect(entries('capacidade', '45.000')).toEqual([{ field: 'capacity', value: '45000' }])
    expect(entries('capacidade', '12 300')).toEqual([{ field: 'capacity', value: '12300' }])
    expect(reason('capacidade', '90')).toMatch(/500 a 300/)
    expect(entries('estádio', ' Mineirão ')).toEqual([{ field: 'stadiumName', value: 'Mineirão' }])
    expect(entries('cidade', 'Belo Horizonte')).toEqual([{ field: 'city', value: 'Belo Horizonte' }])
    expect(entries('força', '82,6')).toEqual([{ field: 'overall', value: '83' }])
    expect(reason('força', '120')).toMatch(/1 a 100/)
    expect(entries('potencial', '90')).toEqual([{ field: 'potential', value: '90' }])
    expect(reason('elenco', 'x')).toMatch(/elenco/)
    expect(reason('sonho', 'x')).toMatch(/desconhecido/)
  })
})

describe('tarefas feitas: planilha do Google', () => {
  const csv = 'tipo,clube,jogador,id,campo,situacao,valor_provisorio,valor_correto,onde_procurar,feito\n' + 'Clube,Mirassol,,wd-Q1,cor 2,x,#fff200,#00aa44,,TRUE\n' + ',,,,,,,,,\n' + 'Jogador conhecido,A,"Fulano, o Grande",wd-Q2,posição,"duas\nlinhas",CB,ZAG,,\n' + 'Clube,B,,wd-Q3,capacidade,x,,"16.000",,sim\n'

  it('lê vírgula, aspas, linhas vazias e a marca de feito, com o número real da linha', () => {
    const { rows, problem } = readTaskSheet(csv)
    expect(problem).toBeUndefined()
    expect(rows.map((r) => [r.line, r.id, r.feito])).toEqual([[2, 'wd-Q1', true], [4, 'wd-Q2', false], [6, 'wd-Q3', true]])
    expect(rows[1]?.jogador).toBe('Fulano, o Grande')
  })

  it('aceita as variações de "feito" e o BOM do Excel', () => {
    const marks = ['sim', 'x', 'OK', 'Feito', 'VERDADEIRO', '✓', '1']
    const text = `﻿id;campo;valor_correto;feito\n${marks.map((m) => `wd-Q1;cor 2;#fff;${m}`).join('\n')}\nwd-Q1;cor 2;#fff;\nwd-Q1;cor 2;#fff;não\n`
    expect(readTaskSheet(text).rows.map((r) => r.feito)).toEqual([...marks.map(() => true), false, false])
  })

  it('arquivo sem as colunas devolve o problema', () => {
    expect(readTaskSheet('a;b\n1;2').problem).toMatch(/faltam as colunas/)
    expect(readTaskSheet('').problem).toBeDefined()
  })

  it('parseCsv diz em que linha cada registro começa', () => {
    expect(parseCsv('a;b\n\n"x\ny";2\n3;4\n').lines).toEqual([1, 3, 5])
  })
})

describe('correções guardadas', () => {
  const item = (id: string, field: Correction['field'], value: string): Correction => ({ id, field, value, at: '2026-10-21' })

  it('a nova correção do mesmo registro e campo substitui a antiga', () => {
    const list: Correction[] = []
    expect(mergeCorrection(list, item('a', 'city', 'X'))).toBe('new')
    expect(mergeCorrection(list, item('a', 'city', 'X'))).toBe('same')
    expect(mergeCorrection(list, item('a', 'city', 'Y'))).toBe('replaced')
    expect(mergeCorrection(list, item('a', 'color1', '#fff'))).toBe('new')
    expect(list).toHaveLength(2)
    expect(list[0]?.value).toBe('Y')
  })

  it('grava e lê o arquivo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'corr-'))
    try {
      expect(loadCorrections(dir)).toEqual([])
      saveCorrections(dir, [item('b', 'city', 'Y'), item('a', 'city', 'X')])
      expect(loadCorrections(dir).map((c) => c.id)).toEqual(['a', 'b'])
      writeFileSync(join(dir, 'correcoes.json'), '{"version":1}')
      expect(loadCorrections(dir)).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('a tarefa está resolvida quando todos os campos dela têm correção', () => {
    const list = [item('c1', 'color1', '#fff'), item('c1', 'color2', '#000'), item('p1', 'position', 'CB')]
    expect(isTaskDone(list, 'c1', 'cores')).toBe(true)
    expect(isTaskDone(list, 'c1', 'cor 2')).toBe(true)
    expect(isTaskDone(list, 'c2', 'cor 2')).toBe(false)
    expect(isTaskDone(list, 'p1', 'posição')).toBe(true)
    expect(isTaskDone(list, 'p1', 'elenco')).toBe(false)
  })

  it('patchSheet muda só as células do registro, sem deixar secundária repetida', () => {
    const sheet = readSheet('id;position;secondaryPositions;color2\np1;CM;CB|DM;\np2;ST;;\n')
    const changed = patchSheet(sheet, [item('p1', 'position', 'CB'), item('p1', 'color2', '#fff'), item('zz', 'position', 'GK')])
    expect(changed).toBe(3)
    expect(sheet.rows[0]).toMatchObject({ position: 'CB', secondaryPositions: 'DM', color2: '#fff' })
    expect(sheet.rows[1]).toMatchObject({ position: 'ST' })
    expect(patchSheet(sheet, [item('p1', 'position', 'CB')])).toBe(0)
  })
})
