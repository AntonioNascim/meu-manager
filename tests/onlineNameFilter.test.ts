import { describe, expect, it } from 'vitest'
import { anonymousNumber, checkName, cleanName, foldText } from '../src/online/nameFilter'

const issue = (text: string) => {
  const r = checkName(text)
  return r.ok ? 'ok' : r.issue
}

describe('apelidos que servem', () => {
  it.each(['Ana', 'Zé Carlos', 'João-10', "D'Artagnan", 'Mister_Tático', 'Técnico Pedro', 'Ünal', 'Marcos.F', 'ЖИВОТ'])('%s', (name) => {
    expect(issue(name)).toBe('ok')
  })

  it('devolve o nome limpo: espaços repetidos, laterais e invisíveis saem', () => {
    const r = checkName('  Ana​   Lima  ')
    expect(r).toEqual({ ok: true, name: 'Ana Lima' })
    expect(cleanName('a  b')).toBe('a b')
  })

  it('não confunde nomes comuns com palavrões (Scunthorpe)', () => {
    for (const name of ['Cockburn', 'Vergara', 'Assis', 'Analista', 'Cassio', 'Mishima', 'Putnam']) expect(issue(name)).toBe('ok')
  })
})

describe('tamanho e caracteres', () => {
  it('3 a 16 letras', () => {
    expect(issue('Jo')).toBe('too-short')
    expect(issue('  a ')).toBe('too-short')
    expect(issue('Abcdefghijklmnopq')).toBe('too-long')
    expect(issue('Abcdefghijklmnop')).toBe('ok')
  })
  it('conta letras de verdade, não unidades do texto (emoji e acento)', () => {
    expect(issue('Zé')).toBe('too-short')
    expect(issue('ÁÉÍÓÚÀÂÊÔÃÕÇ')).toBe('ok')
  })
  it('recusa símbolos, emoji e só números', () => {
    for (const name of ['Ana★Lima', 'Ana😀Lima', 'Ana<b>', 'Ana/Lima', 'ana#12']) expect(issue(name)).toBe('invalid-characters')
    expect(issue('12345')).toBe('invalid-characters')
  })
  it('recusa alfabetos misturados (a, de Ana, em cirílico)', () => {
    expect(issue('Аna')).toBe('mixed-scripts')
    expect(issue('Ανα Lima')).toBe('mixed-scripts')
  })
  it('recusa letra repetida demais', () => {
    expect(issue('Aaaaaana')).toBe('repeated')
    expect(issue('Booom')).toBe('ok')
  })
})

describe('links e contatos', () => {
  it.each(['www.site.com', 'meusite.com', 'site.com.br', 'oi.me/ana', 'discord Ana', 'ana@ana1', 't.me ana', 'http: ana'])('%s', (name) => {
    expect(issue(name)).toBe('link')
  })
  it('telefone, mesmo com separadores', () => {
    for (const name of ['11999998888', '11 99999-8888', '9999 9999', 'zap 99999999']) expect(issue(name)).toBe('phone')
    expect(issue('Time 2024')).toBe('ok')
  })
})

describe('nomes que fingem ser do jogo', () => {
  it.each(['Admin', 'ADMIN', 'a.d.m.i.n', 'Admin 2', 'Moderador', 'Meu Manager', 'MeuManager1', 'Suporte', 'Sup0rte', 'Oficial', 'Staff'])('%s', (name) => {
    expect(issue(name)).toBe('impersonal')
  })
  it('mas não impede um nome que só começa parecido', () => {
    expect(issue('Administrador do Santos')).toBe('too-long')
    expect(issue('Oficina')).toBe('ok')
    expect(issue('Systematic')).toBe('ok')
  })
})

describe('palavrões', () => {
  it.each(['Puta', 'MERDA', 'm3rd4', 'p u t a', 'p.u.t.a', 'fuuuuck', 'f_u_c_k', 'Hitler', 'xHitlerx', 'caralho', 'cárálho', 'N4zi', 'sh1t', 'Bitch', 'FUCK', 'filhodaputa'])('%s', (name) => {
    expect(issue(name)).toBe('profanity')
  })
  it('em qualquer parte do texto', () => {
    expect(issue('Joao merda')).toBe('profanity')
    expect(issue('Zé puta Lima')).toBe('profanity')
  })
})

describe('apelido pronto', () => {
  it('é estável por identidade, fica entre 1000 e 9999 e varia', () => {
    expect(anonymousNumber('abc')).toBe(anonymousNumber('abc'))
    const nums = new Set(Array.from({ length: 200 }, (_, i) => anonymousNumber(`player-${i}`)))
    expect(nums.size).toBeGreaterThan(150)
    for (const n of nums) expect(n >= 1000 && n <= 9999).toBe(true)
  })
  it('foldText tira acento e põe em minúsculas', () => {
    expect(foldText('ÇÃO é Ñ')).toBe('cao e n')
  })
})
