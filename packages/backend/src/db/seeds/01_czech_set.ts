import type { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
  await knex('white_cards').del();
  await knex('black_cards').del();
  await knex('card_sets').del();

  const [setId] = await knex('card_sets').insert({
    name: 'Základní česká sada',
    description: 'Standardní sada pro českou verzi hry.',
    is_public: true,
    slug: 'zakladni-ceska-sada',
  });

  await knex('black_cards').insert([
    { card_set_id: setId, text: 'Proč jsem přišel o práci? ____.', pick: 1 },
    { card_set_id: setId, text: 'Moje babička si přála k Vánocům ____.', pick: 1 },
    { card_set_id: setId, text: 'Co dělá život smysluplným? ____.', pick: 1 },
    { card_set_id: setId, text: 'Doktor říká, že mám jen 3 měsíce na to, abych stihl ____.', pick: 1 },
    { card_set_id: setId, text: 'Tajemství mého úspěchu: ____.', pick: 1 },
    { card_set_id: setId, text: 'V příštím životě chci být ____.', pick: 1 },
    { card_set_id: setId, text: 'Co jsem našel pod postelí? ____.', pick: 1 },
    { card_set_id: setId, text: 'Proč jsem se přestal stýkat s přáteli? ____.', pick: 1 },
    { card_set_id: setId, text: 'Prezident oznámil, že od příštího roku bude povinné ____.', pick: 1 },
    { card_set_id: setId, text: 'Moji rodiče se mě ptají, kdy si konečně pořídím ____.', pick: 1 },
    { card_set_id: setId, text: 'Vědci objevili, že ____ způsobuje rakovinu.', pick: 1 },
    { card_set_id: setId, text: 'Na prvním rande jsem se zmínil o ____.', pick: 1 },
    { card_set_id: setId, text: 'Co dělám, když mám volnou chvilku? ____.', pick: 1 },
    { card_set_id: setId, text: 'Nový trend na sociálních sítích: ____.', pick: 1 },
    { card_set_id: setId, text: 'Proč jsem skončil s terapií? ____.', pick: 1 },
  ]);

  await knex('white_cards').insert([
    { card_set_id: setId, text: 'Spontánní pláč v metru' },
    { card_set_id: setId, text: 'Šéf v pyžamu na Zoomu' },
    { card_set_id: setId, text: 'Táta, který nerozumí memes' },
    { card_set_id: setId, text: 'Existenční krize ve 2 v noci' },
    { card_set_id: setId, text: 'Prokrastinace na smrtelné posteli' },
    { card_set_id: setId, text: 'Bezlepková pizza bez chuti' },
    { card_set_id: setId, text: 'Komentáře pod zpravodajskými články' },
    { card_set_id: setId, text: 'Přátelé, kteří pošlou "ok" na hodinu textu' },
    { card_set_id: setId, text: 'Věčně nabitý telefon, který je vždy vybitý' },
    { card_set_id: setId, text: 'Soused, který cvičí ve 3 ráno' },
    { card_set_id: setId, text: 'Rodiče na Facebooku lajkující každý příspěvek' },
    { card_set_id: setId, text: 'Kolega, co přináší rybu do mikrovlnky' },
    { card_set_id: setId, text: 'Nezodpovězené zprávy z roku 2019' },
    { card_set_id: setId, text: 'Ponocování s pocitem produktivity' },
    { card_set_id: setId, text: 'Druhý jídlíček v kině' },
    { card_set_id: setId, text: 'Nervózní smích v nevhodnou chvíli' },
    { card_set_id: setId, text: 'Sen, ve kterém padáš' },
    { card_set_id: setId, text: 'Zapomenutá písnička, co se vrátí v noci' },
    { card_set_id: setId, text: 'Pracovní oběd, kde nikdo neví, co říct' },
    { card_set_id: setId, text: 'Člověk, co mluví v kině' },
    { card_set_id: setId, text: 'Příbuzný s kontroverzními názory' },
    { card_set_id: setId, text: 'Děti v restauraci' },
    { card_set_id: setId, text: 'Pes, co olizuje vše' },
    { card_set_id: setId, text: 'Noční nákupy na internetu' },
    { card_set_id: setId, text: 'Sebevzdělávání přes Netflix' },
    { card_set_id: setId, text: 'Příslib "jen pět minut"' },
    { card_set_id: setId, text: 'Influencer z malého města' },
    { card_set_id: setId, text: 'Anonymní komentátor na Redditu' },
    { card_set_id: setId, text: 'Párty, kde je jen jedna Becherovka' },
    { card_set_id: setId, text: 'Terapeut, který potřebuje terapeuta' },
    { card_set_id: setId, text: 'Selfie na pohřbu' },
    { card_set_id: setId, text: 'Výmluva "mám špatný signál"' },
    { card_set_id: setId, text: 'Narychlo koupený dárek na benzínce' },
    { card_set_id: setId, text: 'Nerealistické novoroční předsevzetí' },
    { card_set_id: setId, text: 'Muž středního věku s e-scootem' },
  ]);
}
