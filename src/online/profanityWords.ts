/**
 * Palavras que não podem aparecer em nome de jogador, apelido, clube, estádio ou cidade (vandalismo da Wikipedia/Wikidata). Português, espanhol, inglês,
 * italiano, francês, alemão e holandês, mais ódio e extremismo. Comparação sem acento e sem maiúsculas.
 * - `WORDS`: palavra inteira (nomes legítimos podem conter estes trechos: "Vergara", "Toshitaka", "Cockburn").
 * - `ROOTS`: pedaço que não aparece em nome próprio nenhum e vale em qualquer parte da palavra.
 * Fica de fora de propósito o que é sobrenome ou apelido comum e legítimo (Pinto, Cabeza, Negro como apelido sozinho é só aviso).
 */
export const WORDS: ReadonlySet<string> = new Set([
  // português
  'puta', 'puto', 'putas', 'putaria', 'merda', 'bosta', 'caralho', 'porra', 'cacete', 'foder', 'fodido', 'fodase', 'viado', 'viadinho', 'bicha', 'boiola', 'buceta', 'xoxota', 'xereca', 'punheta', 'cuzao', 'cuzinho', 'arrombado', 'vagabundo', 'vagabunda', 'safado', 'safada', 'piranha', 'corno', 'corna', 'otario', 'babaca', 'idiota', 'imbecil', 'retardado', 'crioulo', 'neguinho', 'bunda', 'cocô', 'bundao', 'bundão', 'bundinha', 'escroto', 'escrota', 'vadia', 'mongoloide', 'paneleiro', 'sapatao', 'traveco', 'tarado', 'estuprador', 'pedofilo', 'pedófilo',
  // espanhol
  'mierda', 'puta', 'puto', 'pendejo', 'pendeja', 'cabron', 'cabrona', 'coño', 'joder', 'gilipollas', 'capullo', 'maricon', 'maricona', 'boludo', 'boluda', 'pelotudo', 'pelotuda', 'conchudo', 'culo', 'culiao', 'culiado', 'verga', 'chingada', 'chingado', 'chinga', 'cagon', 'cagado', 'mamon', 'mamada', 'hijueputa', 'malparido', 'gonorrea', 'hdp', 'ctm', 'sudaca',
  // inglês
  'fuck', 'fucker', 'fucking', 'fucked', 'shit', 'shitty', 'bullshit', 'bitch', 'bastard', 'asshole', 'arsehole', 'dickhead', 'cunt', 'pussy', 'cock', 'cocks', 'wanker', 'twat', 'whore', 'slut', 'nigger', 'nigga', 'faggot', 'retarded', 'tits', 'boobs', 'penis', 'vagina', 'dildo', 'jizz', 'porn', 'paedo', 'pedo', 'rapist', 'idiot', 'stupid', 'loser', 'dumb', 'noob', 'lol', 'lmao',
  // italiano
  'cazzo', 'merda', 'stronzo', 'stronza', 'vaffanculo', 'figa', 'puttana', 'troia', 'frocio', 'finocchio', 'coglione', 'minchia', 'bastardo', 'bastarda',
  // francês
  'putain', 'pute', 'merde', 'connard', 'connasse', 'salope', 'encule', 'enculé', 'nique', 'niquer', 'couille', 'couilles', 'pedale', 'batard', 'foutre', 'salaud',
  // alemão
  'scheisse', 'scheiße', 'arschloch', 'arsch', 'schwanz', 'hurensohn', 'wichser', 'fotze', 'schlampe', 'ficken', 'schwuchtel', 'spast', 'behindert', 'dummkopf',
  // holandês
  'klootzak', 'kanker', 'tering', 'tyfus', 'neuken', 'flikker', 'mongool',
  // ódio e extremismo
  'nazi', 'nazista', 'hitler', 'kkk', 'isis', 'terrorista', 'terrorist', 'jihad', 'holocaust', 'swastika', 'fascista', 'racista',
])

export const ROOTS: readonly string[] = ['fuck', 'puta madre', 'putamadre', 'mierda', 'merda', 'caralho', 'putain', 'scheiss', 'scheiß', 'cazzo', 'stronz', 'vaffanc', 'bitch', 'whore', 'asshole', 'nigger', 'faggot', 'maricon', 'cabron', 'pendejo', 'pelotud', 'gilipoll', 'chingad', 'buceta', 'punheta', 'hijoputa', 'hijodeputa', 'filhodaputa', 'filhadaputa', 'hitler', 'bullshit']

/** Termos que só pedem uma olhada (podem ser apelido de torcida ou de infância): `baixa`. */
export const MILD: ReadonlySet<string> = new Set(['macaco', 'negro', 'preto', 'gordo', 'gorda', 'flaco', 'loco', 'loca', 'burro', 'bobo', 'feio', 'feia', 'peludo', 'cabeza', 'cabezon', 'chato', 'careca', 'baixinho'])
