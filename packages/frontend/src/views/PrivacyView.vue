<script setup lang="ts">
// Standalone page — no profile required
</script>

<template>
  <div class="min-h-screen bg-gray-900 text-white">
    <div class="max-w-2xl mx-auto px-6 py-12 space-y-8">

      <div>
        <a href="/" class="text-slate-400 hover:text-white text-sm transition-colors">← Zpět na hru</a>
      </div>

      <h1 class="text-3xl font-black uppercase italic tracking-tighter">Zásady ochrany osobních údajů</h1>
      <p class="text-slate-400 text-sm">Naposledy aktualizováno: březen 2026</p>

      <section class="space-y-3">
        <h2 class="text-lg font-bold text-white">1. Kdo jsme</h2>
        <p class="text-slate-300 leading-relaxed">
          Tato aplikace je soukromý projekt — online verze karetní hry Karty proti lidskosti,
          provozovaná výhradně pro zábavu přátel a blízkých. Není provozována komerčně.
        </p>
      </section>

      <section class="space-y-3">
        <h2 class="text-lg font-bold text-white">2. Jaké údaje shromažďujeme</h2>
        <p class="text-slate-300 leading-relaxed">
          Pokud se přihlásíte přes Google nebo Discord, obdržíme od poskytovatele:
        </p>
        <ul class="list-disc list-inside text-slate-300 space-y-1 ml-2">
          <li>Jedinečné ID vašeho účtu u poskytovatele (Google nebo Discord)</li>
          <li>URL vaší profilové fotografie</li>
        </ul>
        <p class="text-slate-300 leading-relaxed">
          Tyto údaje ukládáme do naší databáze, abychom vás mohli při příštím přihlášení rozpoznat.
          Neukládáme vaši e-mailovou adresu, heslo ani žádné citlivé osobní údaje.
        </p>
        <p class="text-slate-300 leading-relaxed">
          Bez přihlášení (hra jako host) neukládáme žádné osobní údaje — přezdívka a nastavení
          jsou uloženy výhradně v místním úložišti vašeho prohlížeče (localStorage).
        </p>
      </section>

      <section class="space-y-3">
        <h2 class="text-lg font-bold text-white">3. Soubory cookie</h2>
        <p class="text-slate-300 leading-relaxed">
          Po přihlášení uložíme do vašeho prohlížeče jeden soubor cookie (<code class="bg-white/10 px-1 rounded text-sm">kpl_token</code>),
          který slouží výhradně k udržení vaší přihlášené session. Cookie je označen jako
          <em>httpOnly</em> (není přístupný JavaScriptu) a <em>SameSite=Lax</em>.
          Nevyužíváme analytické, reklamní ani sledovací cookies.
        </p>
      </section>

      <section class="space-y-3">
        <h2 class="text-lg font-bold text-white">4. Jak údaje používáme</h2>
        <ul class="list-disc list-inside text-slate-300 space-y-1 ml-2">
          <li>Rozpoznání vašeho účtu při přihlášení</li>
          <li>Zobrazení vaší profilové fotografie v aplikaci</li>
          <li>Uložení vašeho herního profilu (přezdívka, jazyk)</li>
        </ul>
        <p class="text-slate-300 leading-relaxed">
          Údaje nevyužíváme pro reklamní účely, neprodáváme je ani nesdílíme s třetími stranami.
        </p>
      </section>

      <section class="space-y-3">
        <h2 class="text-lg font-bold text-white">5. Uchovávání a smazání údajů</h2>
        <p class="text-slate-300 leading-relaxed">
          Vaše údaje uchováváme po dobu existence vaší herní session. Pokud chcete,
          aby byly vaše údaje smazány, odhlaste se v aplikaci a kontaktujte nás na adrese
          uvedené níže — data smažeme do 30 dnů od obdržení žádosti.
        </p>
      </section>

      <section class="space-y-3">
        <h2 class="text-lg font-bold text-white">6. Bezpečnost</h2>
        <p class="text-slate-300 leading-relaxed">
          Přístup k databázi je chráněn. Komunikace probíhá přes HTTPS.
          Jako malý soukromý projekt nemůžeme zaručit absolutní bezpečnost,
          proto doporučujeme nesdílet v aplikaci žádné citlivé informace.
        </p>
      </section>

      <section class="space-y-3">
        <h2 class="text-lg font-bold text-white">7. Kontakt</h2>
        <p class="text-slate-300 leading-relaxed">
          Máte-li dotazy ke zpracování osobních údajů, napište nám na:
          <a href="mailto:kpl@wnc.cz" class="text-white underline hover:text-slate-300">kpl@wnc.cz</a>
        </p>
      </section>

      <div class="border-t border-white/10 pt-6 flex gap-4 text-sm text-slate-500">
        <a href="/privacy" class="hover:text-white transition-colors">Zásady ochrany osobních údajů</a>
        <a href="/terms-of-service" class="hover:text-white transition-colors">Podmínky užívání</a>
      </div>

    </div>
  </div>
</template>
