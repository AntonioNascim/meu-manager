/**
 * Textos da imprensa: manchetes e coletivas. Os veículos e os jornalistas são fictícios (nada de nomes reais) e as perguntas e manchetes são
 * escritas pelo jogo. O motor só entrega fatos e o número da pergunta; aqui eles viram palavras.
 */
import { PRESS_QUESTIONS } from '../../../engine/press'
import type { PressFact, PressOccasion, PressTone } from '../../../engine/press'

export interface Outlet {
  name: string
  reporter: string
}
export const OUTLETS: readonly Outlet[] = [
  { name: 'Gazeta do Esporte', reporter: 'Lúcia Marques' },
  { name: 'Rádio Estádio', reporter: 'Paulo Cintra' },
  { name: 'Portal Bola Cheia', reporter: 'Marina Duarte' },
  { name: 'Folha da Rodada', reporter: 'Caio Brandão' },
]

const hash = (s: string): number => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}
const pickBy = <T>(list: readonly T[], key: string): T => list[hash(key) % list.length] as T

export interface HeadlineContext {
  team: string
  opponent?: string
  player?: string
  money: (v: number) => string
}

export interface Headline {
  outlet: string
  title: string
  tone: 'good' | 'bad' | 'neutral'
}

/** A manchete de um fato: veículo e título estáveis para o mesmo fato (sorteio pelo conteúdo). */
export function headlineOf(f: PressFact, c: HeadlineContext): Headline {
  const key = `${f.kind}:${f.date}:${'matchId' in f ? f.matchId : 'playerId' in f ? f.playerId : ''}`
  const outlet = (pickBy(OUTLETS, key) as Outlet).name
  const opp = c.opponent ?? 'adversário'
  switch (f.kind) {
    case 'result': {
      const score = `${f.goalsFor} a ${f.goalsAgainst}`
      if (f.outcome === 'win')
        return { outlet, tone: 'good', title: pickBy([`${c.team} vence o ${opp} por ${score}`, `Vitória ${f.home ? 'em casa' : 'fora'}: ${c.team} bate o ${opp} (${score})`, `${c.team} supera o ${opp} e comemora ${score}`], key) }
      if (f.outcome === 'draw') return { outlet, tone: 'neutral', title: pickBy([`${c.team} fica no ${f.goalsFor} a ${f.goalsAgainst} com o ${opp}`, `Empate ${f.home ? 'em casa' : 'fora'}: ${c.team} e ${opp} dividem os pontos`], key) }
      return { outlet, tone: 'bad', title: pickBy([`${c.team} tropeça diante do ${opp}: ${f.goalsAgainst} a ${f.goalsFor}`, `Derrota ${f.home ? 'em casa' : 'fora'}: ${opp} leva a melhor sobre o ${c.team}`], key) }
    }
    case 'streak':
      return f.outcome === 'win'
        ? { outlet, tone: 'good', title: `${f.games} vitórias seguidas: o ${c.team} embala` }
        : f.outcome === 'loss'
          ? { outlet, tone: 'bad', title: `${f.games} derrotas seguidas aumentam a pressão sobre o técnico do ${c.team}` }
          : { outlet, tone: 'good', title: `${c.team} chega a ${f.games} jogos sem perder` }
    case 'position':
      return f.position === 1
        ? { outlet, tone: 'good', title: `${c.team} é o líder do campeonato` }
        : f.position <= 4
          ? { outlet, tone: 'good', title: `${c.team} segue entre os primeiros: ${f.position}º lugar` }
          : f.position > f.size - 4
            ? { outlet, tone: 'bad', title: `${c.team} está na zona de rebaixamento (${f.position}º de ${f.size})` }
            : { outlet, tone: 'neutral', title: `${c.team} ocupa o ${f.position}º lugar entre ${f.size} clubes` }
    case 'top-scorer':
      return { outlet, tone: 'good', title: `${c.player ?? 'O artilheiro'} chega a ${f.goals} gols e lidera o ataque do ${c.team}` }
    case 'injury':
      return { outlet, tone: 'bad', title: `${c.player ?? 'Um titular'} é desfalque do ${c.team} por ${f.days} ${f.days === 1 ? 'dia' : 'dias'}` }
    case 'signing':
      return { outlet, tone: 'good', title: `${c.team} anuncia ${c.player ?? 'um reforço'}${f.fee > 0 ? ` por ${c.money(f.fee)}` : ' sem custo'}` }
  }
}

const QUESTIONS: Record<PressOccasion, readonly string[]> = {
  eve: ['Como o time chega para o jogo de amanhã?', 'O que você espera do adversário?', 'Alguma mudança na escalação?', 'Qual o recado para a torcida antes da partida?'],
  win: ['A vitória muda o clima do vestiário?', 'O que funcionou melhor hoje?', 'O time está no caminho certo?', 'Algum jogador merece destaque?'],
  draw: ['Foi um ponto ganho ou dois perdidos?', 'O que faltou para vencer?', 'O time ficou satisfeito com o resultado?', 'O que dá para aproveitar do jogo?'],
  loss: ['O que deu errado na derrota?', 'Você teme pelo cargo?', 'O time perdeu a confiança?', 'O que muda para o próximo jogo?'],
}

export const TONE_LABELS: Record<PressTone, string> = { humble: 'Humilde', confident: 'Confiante', defend: 'Defender o grupo' }

/** A pergunta da coletiva e quem a faz. */
export function questionOf(occasion: PressOccasion, question: number, key: string): { text: string; outlet: Outlet } {
  const list = QUESTIONS[occasion]
  return { text: list[question % PRESS_QUESTIONS] as string, outlet: pickBy(OUTLETS, key) as Outlet }
}

const ANSWERS: Record<PressOccasion, Record<PressTone, string>> = {
  eve: { humble: '«Respeito muito o adversário. Vamos jogo a jogo, com os pés no chão.»', confident: '«Estamos preparados. Vamos fazer um grande jogo e buscar a vitória.»', defend: '«Confio nesse grupo. Eles trabalharam bem a semana e merecem o nosso crédito.»' },
  win: { humble: '«Foi um bom resultado, mas ainda há muito a melhorar. Seguimos trabalhando.»', confident: '«O time mostrou personalidade. É assim que vamos buscar os nossos objetivos.»', defend: '«O mérito é dos jogadores, que se entregaram do começo ao fim.»' },
  draw: { humble: '«Faltou um pouco mais. Vamos analisar e corrigir o que for preciso.»', confident: '«Dominamos boa parte do jogo. O resultado não reflete o que fizemos.»', defend: '«O grupo lutou até o fim. Não vou apontar culpados.»' },
  loss: { humble: '«A responsabilidade é minha. Vamos trabalhar para dar a resposta.»', confident: '«Foi um tropeço. Eu confio no time e a reação vem já no próximo jogo.»', defend: '«Protejo os meus jogadores. Eles sabem o que precisam melhorar.»' },
}

export const answerText = (occasion: PressOccasion, tone: PressTone): string => ANSWERS[occasion][tone]

export const OCCASION_LABELS: Record<PressOccasion, string> = { eve: 'Véspera do jogo', win: 'Depois da vitória', draw: 'Depois do empate', loss: 'Depois da derrota' }
