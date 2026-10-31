import { describe, expect, it } from 'vitest'
import { playerName } from '../src/ui/format'

describe('nome do jogador na interface', () => {
  it('mostra o nome pelo qual o jogador é conhecido; o nome completo fica em name', () => {
    expect(playerName({ name: 'Gabriel Barbosa', nickname: 'Gabigol' })).toBe('Gabigol')
    expect(playerName({ name: 'Marcus Vinicius Oliveira Alencar', nickname: 'Marquinhos' })).toBe('Marquinhos')
    expect(playerName({ name: 'Phil Foden' })).toBe('Phil Foden')
  })
})
