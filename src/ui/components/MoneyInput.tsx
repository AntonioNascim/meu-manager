import type { InputHTMLAttributes } from 'react'
import { formatMoney } from '../format'

/** Texto em reais (R$ 56.080.000) para o que a pessoa digitou; só os números contam. */
export const moneyText = (value: number): string => (Number.isFinite(value) && value > 0 ? formatMoney(Math.round(value)) : '')

/** Tira tudo que não é dígito (a pessoa pode digitar só os números ou colar com pontos e R$). */
export const parseMoney = (text: string): number => {
  const digits = text.replace(/\D/g, '').slice(0, 12)
  return digits === '' ? 0 : Number(digits)
}

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & { value: number; onChange: (value: number) => void }

/** Campo de dinheiro: mostra com pontos e "R$" enquanto digita e aceita só números. */
export function MoneyInput({ value, onChange, ...rest }: Props) {
  return <input {...rest} type="text" inputMode="numeric" autoComplete="off" placeholder={rest.placeholder ?? 'R$ 0'} value={moneyText(value)} onChange={(e) => onChange(parseMoney(e.target.value))} />
}
