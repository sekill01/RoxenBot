/**
 * RoxenBot Adana Edition - Özel Şive & Sataşma Cümleleri
 */

const FUNNY_REPLIES = [
  "@{username} Gardaş sen hayırdır ya, Adana Demirspor tribünü mü burası artistlik yapıyon? Gel bi acılı şalgamımı iç sakinleş, hararetini alayım!",
  "@{username} Bak hele lafa bak! Kirvem seni Baraj yolunda bi turlatırım aklın uçar ha, klavye delikanlılığını bırak botla düzgün konuş!",
  "@{username} La gardaş klavyenin arkasından şekil yapmak kolay, gel Taşköprü'nün orada söyle bunları da delikanlılığını görek!",
  "@{username} Ula kirvem sen kime racon kesiyon gardaşşş? İki dakka efendi takıldık diye tepemize çıktın, valla barajın suyuna batırır çıkarırım ha!",
  "@{username} Gözünü sevdiğimin çocuğu, seni bi sıkarım Adana portakalı gibi suyun çıkar ha! Espiri yapıyok şurda artistlik yapma!",
  "@{username} Gardaş senin kafana Adana güneşi geçmiş belli, 45 derece sıcağı yememişsin klavyede artistlik taslıyon, git bi kafanı soğuk suya sok gel!",
  "@{username} Vay babayın kemiğine, lafa bak lafa! Gel sana çarşıda bi acılı Adana dürüm ısmarlayayım da tatlıya bağlayak şu mevzuyu, karnın doysun!",
  "@{username} Ağam sen hayırdır la? Ben yapay zekayım ama Seyhan sanayisinde rektifiye edildim, bana artistlik şükül sökmez aslanım!",
  "@{username} Bak hele moruk, laflara bak! Seni güneşe ateş eden dayılara havale ederim bak valla roket atarlar peşinden düzgün dur!",
  "@{username} Kirvem damarıma basma benim, Adana sıcağında asfalt gibi erimişim zaten, bi parlarsam fena bozarım ha haberin olsun!",
  "@{username} Gardaşşş sen ne anlatıyon ya? Bici biciye buz yetmemiş gibi triplere girmişsin, gel bi otur soluklan iki çift laf öğren!",
  "@{username} Ula gardaş senin havan kime? Gazipaşa bulvarında iki tur atınca kendini mafya babası mı zannettin, otur oturduğun yerde!",
  "@{username} Bak hele şu artistin lafına! Kirvem ben sabahları kahvaltıda acılı kebapla şırdan yiyen botum, senin lafın bana vız gelir tırıs gider!",
  "@{username} Gardaş senin canın sıkılmış anlaşılan, gel seni Büyüksaat'in altına götüreyim de orada anlatsana bu masalları dayılara!",
  "@{username} La oğlum senin derdin ne la? Yayında efendi efendi oturuyoz şurda, Adana çocuğu her yerde Adana çocuğudur damarımıza basma!",
  "@{username} Vay kirvem vay, laflara bak! Sanki Çetinkaya kavşağında yol verme kavgası ediyok, sakin ol gardaş şurda aile var!",
  "@{username} Bak hele gardaşım, fazla atarlanma motorun su kaynatır ha! Adana sıcağında vantilatör bile senin kadar hararet yapmıyor!",
  "@{username} Ula sen kendini ne sanıyon kirvem? Yüreğir sanayisindeki çıraklar bile senden daha delikanlı konuşuyor, az efendi ol!",
  "@{username} Gardaş sana bi şalgam bi de acılı cici büfe tostu söyleyeyim de çenen kapansın, maşallah makineli tüfek gibi laf yetiştiriyon!",
  "@{username} Kirvem lafların bana dokunmaz, benim arkamda 01 plakalı koca Adana var! Sen git kumda oyna şekil yapma bota!",
  "@{username} Bak hele, kime laf yetiştiriyon sen? Seni Baraj gölüne götürürüm, suyun dibinde inci aratırım ha, akıllı ol gardaşşş!",
  "@{username} Gardaş senin bu özgüven nereden geliyor la? Reşatbey'de iki tur atıp kendini Adana ağası mı sandın, efendi dur yayını izle!",
  "@{username} Ağam yavaş gel ciğerimi söktün! Sanki meclis kürsüsünde nutuk atıyor, iki dakka chatte durdun hemen herkese sataştın!",
  "@{username} La gardaş sen hayırdır? Adana Demirspor gol kaçırınca bizim dayıların sinirlendiği gibi sinirlenmişsin, sakin ol derin nefes al!",
  "@{username} Gözünü seveyim kirvem yapma şöyle hareketler, sonra Adana sokaklarında şırdancı ararken bulursun kendini, fena çarparım ha!",
  "@{username} Valla gardaşşş senin bu artisliklerini Adana sıcağı bile eritir! Az sakin ol, çayını çorbanı iç efendi gibi chatini yap!",
  "@{username} Bak hele canımın içi, bana şekil yapacam diye kendini paralamışsın. Gel Taşköprü manzarasına karşı bi kaçak çay içek sakinleş!",
  "@{username} Ula kirvem sen kime dikleniyon? Ben bot halimle senden daha delikanlıyım, gel Adana kebap feda olsun sana ama düzgün konuş!",
  "@{username} Gardaş senin bu havan kime la? Seni bi döner kavşakta bıraksam yolunu bulamazsın, gelmiş bota artistlik yapıyon!",
  "@{username} Kirvem az geri bas vitesin dağılmasın! Burası nezih yayın, Adana usulü kafa göz yarmayalım durduk yere, tatlı tatlı konuşak!"
];

const IDLE_REPLIES = [
  "@{username} kirvem nereye kayboldun la? Klavyene çay mı döküldü gardaş bi ses ver hele, iki kelam et de chat şenlensin!",
  "@{username} gardaşım hayırdır daldın gittin, Adana sıcağı mı vurdu başına niye yazmıyon la? Parmakların mı yoruldu bi ses ver!",
  "@{username} la gardaş iki laklak edek dedik hemen arazi oldun! Hayırdır küstün mü bize, gel bi iki bişi yaz da bilek yaşadığını!",
  "@{username} bak hele moruk, yayıncıyı tek mi bırakacan? Bi ses ver de bilek buralarda olduğunu, öyle sessiz sessiz pusma köşede!",
  "@{username} gardaşşş nereye sıvıştın la? Taşköprü'den aşağı mı atladın naptın, gel iki kelam et kaçma öyle sessiz sessiz!",
  "@{username} ula kirvem iki dakka sustun ortalık buz kesti! Yoksa şırdancıya mı kaçtın, yazsana gardaş ne duruyon öyle melul melul!",
  "@{username} bak hele gardaş, klavyen mi bozuldu yoksa Adana sıcağından parmakların tuşlara mı yapıştı? Bi 'sa' yaz da görek!",
  "@{username} kirvem seni arıyok fellik fellik! Chatte kayboldun gittin, hayırdır baraj gölüne yüzmeye mi gittin ses ver hele!",
  "@{username} la gardaş iki kelime yazmak bu kadar mı zor? Bici bicinin buzunu bekler gibi seni bekliyok chatte, yazsana iki satır!",
  "@{username} bak hele ağam, az önce buralarda bülbül gibi şakıyodun, iki dakka geçti dut yemiş bülbüle döndün hayırdır ne oldu?",
  "@{username} gardaşım sesin soluğun kesildi, Adana dürümün acısı boğazına mı kaçtı naptın? Bi ses ver de içimiz rahat etsin!",
  "@{username} ula kirvem köşede hayalet gibi dikilme öyle, bi şeyler yaz da chat canlansın, yayıncıyı yalnız mı bırakacan!",
  "@{username} bak hele şu sessizliğe! Gardaşşş seni Seyhan zabıtaları mı kovaladı nereye kaçtın, iki dakka yazmayınca merak ediyok!",
  "@{username} kirvem valla darılırım ha, iki muhabbetin belini kırıyoduk hemen kaçtın! Gel hele buraya iki laklak edek!",
  "@{username} la gardaş parmaklarına kramp mı girdi? Adana sıcağında vantilatörün karşısında uyuya mı kaldın, uyan da yaz hele!",
  "@{username} bak hele moruk, öyle gizli gizli yayını izleyip tek kelime yazmamak yakışır mı Adana delikanlısına? Yazsana iki kelam!",
  "@{username} gardaş sen hayırdır la? Az önce buralardaydın, iki dakka sustun zannettik ki şalgam fabrikasına ortak olmaya gittin!",
  "@{username} kirvem nereye kayboldun gözünü seveyim? Seni Büyüksaat'in meydanında anons mu ettirek, bi ses ver hele buradayım de!",
  "@{username} ula gardaş iki dakka yazmadın chat kurudu valla! Gel bi canlandır buraları, kebap kokusunu almış kedi gibi bekleme öyle!",
  "@{username} bak hele kirvem, klavyeyi mi yedin naptın? İki dakka önce yazıyodun şimdi tık yok, hayırdır elektriğin mi kesildi?",
  "@{username} gardaşşş ses ver ses! Baraj yolunda drift atarken lastiğin mi patladı, niye yazmıyon la iki dakkadır merak ettik!",
  "@{username} la kirvem az konuş da çenemiz açılsın, öyle duvara bakar gibi bakma ekrana! Bi el salla bi 'burdayım' de bari!"
];

module.exports = {
  FUNNY_REPLIES,
  IDLE_REPLIES
};
