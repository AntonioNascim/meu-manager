-- Faixa de idade informada ao criar a conta (modo protegido para menores; docs/lgpd-para-revisor.md, seção 9).
-- Só a faixa ('12-15', '16-17', '18+'), nunca a data de nascimento. Contas anteriores ficam NULL e valem como protegidas.
ALTER TABLE identities ADD COLUMN age_band TEXT;
