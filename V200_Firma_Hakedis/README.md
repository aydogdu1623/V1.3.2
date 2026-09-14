# CephePro V200 — Beş Sayfalı Firma Hakedişi

Bu klasör, güncel CephePro ön yüzüne uygulanacak firma hakediş raporu güncellemesini ve kullanılabilir boş Excel şablonunu içerir. Canlı sürüme yayımlanmamıştır. Bu arşivin kökündeki eski uygulama kaynakları güncel sunucu yedeği değildir; Vercel'e arşivin tamamını uygulama olarak göndermeyin.

## Teslim edilenler

- `CephePro_Firma_Hakedis_5_Sayfa_Sablon.xlsx`: Gerçek proje verisi içermeyen, formüllü Excel dosyası.
- `assets/claims-v182.js`: Mevcut hakediş ekranına entegre V200 rapor motoru.
- `report-engine.js`: Ayrı kullanılabilen rapor üreticisi; tarayıcıda mevcut ExcelJS kitaplığını kullanır.
- `apply-v200.mjs`: Güncel uygulama dosyalarına ön yüz yamasını uygular ve önce yedek alır.
- `generate-template.mjs`: Boş Excel'i tekrar oluşturur.
- `tools/` ve `tests/`: Şablon yazıcısı, formül değerlendirme ve dosya kontrolleri.

Kullanıcının eklediği Profesyonel_Firma_Hakedis_Raporu_2026.xlsx bu oturumda dosya erişimi bulunmadığından okunamadı. Bu teslim, onun değiştirilmiş kopyası veya içindeki verilerin aktarımı değildir. Yeni oluşturulmuş şablon ve uygulama güncellemesidir.

## Tam olarak beş çalışma sayfası

| Sayfa | İçerik ve bağlantı |
| --- | --- |
| Hakediş İcmali (Kapak) | Proje, firma, sözleşme, dönem; dört KPI; imalat, tutanak, brüt, kesinti, net, KDV ve ödeme hesabı; üç imza bloku |
| Sözleşme Metrajı | Poz, blok, cephe, açıklama, birim, birim fiyat, miktar ve F × G sözleşme tutarı |
| Hakediş Cetveli | Sözleşmeden bağlı fiyat ve tanımlar; önceki, dönem ve toplam miktar; dönem tutarı ve tamamlanma |
| Saha Tutanakları | Tutanak numarası, tarih, açıklama, miktar, birim, fiyat ve tutar |
| Kesintiler ve Cezalar | Teminat, avans, varsa stopaj/tevkifat ve kayıtlı saha kesintileri |

Lacivert #1B365D, orta mavi #2C4D75, açık zebra #F8FAFC; beyaz kalın başlıklar, gri kenarlıklar, TL/miktar/yüzde biçimleri, başlık sabitleme, metne göre ayarlanan genişlikler ve yazdırma ayarları kullanılır. Hesap sayfasında ilk beş sütun da sabittir.

Bu, kullanıcının belirttiği rapor düzeninde hazırlanmış sözleşmeye göre uyarlanabilir bir şablondur. Resmî ÇŞB formu veya FIDIC tarafından onaylanmış/sertifikalanmış belge iddiası taşımaz.

## Site verileri nasıl dolar?

Güncelleme yayımlandıktan sonra firma raporu indirildiği anda seçili hakedişteki firma/sözleşme bilgileri, sözleşme metrajı, dönem imalatları, kayıtlı önceki hakedişler, tutanaklar ve kesintiler alınır. Sitede değişiklik yapıp yeniden indirmek güncel bir dosya oluşturur. Daha önce indirilmiş Excel'in siteyle canlı bağlantısı yoktur.

- Firma ve Sözleşme Bilgileri paneli boş alanların kaynağıdır. Proje ayarlarındaki mevcut bilgiler uygun alanlara aktarılır.
- KDV %20 ve nakit teminat %5, kullanıcının istediği başlangıç değerleridir; mevcut açık oranların üzerine yazılmaz ve değiştirilebilir.
- Başka yöneticinin arşivi görüntülenirken eksik oranlara yeni varsayım eklenmez; kaydın kendi bilgileri kullanılır.
- Tutanak girişine Tutanak No alanı eklendi; kayıtta ve Excel'de korunur.
- Kesinti listesine Nakit Teminat, Yemek/Konaklama ve Şantiye Gider Katılımı eklendi.
- Listede kayıtlı avans/teminat varsa parametredeki otomatik karşılığı ayrıca kesilmez.
- A1 GC2_Kopya ayrı cephe kaydı olarak korunur; adında Kopya bulunması dışlama sebebi değildir.
- Önceki hakediş zinciri eksikse önceki ve kümülatif miktarlar uydurulmaz.
- Gerekli miktar veya fiyat eksikse ilgili hesap boş kalır. Açıkça girilmiş 0 ile eksik değer ayrılır.

İstenen yeni format gereği Hakediş Cetveli birim fiyatı Sözleşme Metrajı sayfasından gelir. Sitedeki sözleşme fiyatının kaynağı firma finansal birim fiyat tablosudur. Döneme özel fiyat sözleşmeden farklıysa raporun kontrol notlarında belirtilir; bu cetvelde ödeme hesabı sözleşme fiyatıyla yapılır. Farklı fiyat kullanılacaksa onaylı sözleşme fiyatı veya ayrı fiyat farkı bilgisi düzenlenmelidir.

## Excel'i doğrudan doldurmak

1. Kapakta proje/firma/sözleşme/dönem bilgilerini yazın.
2. Sözleşme Metrajı sayfasında ayrılan 20 satıra poz bilgilerini, fiyat ve sözleşme miktarını girin.
3. Hakediş Cetveli G/H sütunlarına önceki ve dönem miktarlarını girin. İlk hakedişte önceki miktara 0 yazın.
4. Saha Tutanakları sayfasındaki boş satırlara varsa ek işleri yazın. Fiyat farkı satırı kapaktaki Fiyat farkı parametresine bağlıdır.
5. Kapakta avans yoksa 0 yazın. Kesintiler sayfasındaki İSG/yemek/gider satırları uygulanmıyorsa tutarlarına 0 yazın.
6. Oranları ve gerekiyorsa matrahları sözleşmenize göre ayarlayın. Formüllü hücreler diğer sayfalara bağlıdır.

Şablon, bilinmeyen kesintileri sıfır kabul ederek kesin ödeme göstermez. Boş şablonda ödeme toplamının boş olması bu nedenledir. Siteden üretilen raporda satır sayısı kaynak verinin sayısına göre artar; bağımsız Excel'de ayrılan aralığın dışına taşılacaksa toplam aralıkları da genişletilmelidir.

Kapakta E21 KDV, L21 teminat, L22 avans; E23/L23 isteğe bağlı KDV/teminat matrahı; E24 stopaj, L24 KDV tevkifatı; E25 stopaj matrahı ve L25 fiyat farkıdır. Boş matrah yerine dönem brütü kullanılır. Kesintiler sonrası nete KDV eklenir; kesinti oranı ile KDV matrahı ayrı parametrelerdir. Oranlar kullanıcının sözleşme girdileridir.

## Güncel uygulamaya uygulama

Güncel V197 sunucu kaynakları bulunan proje üzerinde:

```sh
node V200_Firma_Hakedis/apply-v200.mjs /tam/guncel-proje/yolu
node V200_Firma_Hakedis/tests/report.test.mjs
```

Uygulayıcı önce kaynak uyumluluğunu denetler, yedek alır, hakediş JS dosyasını değiştirir, Ayarlar açılış düzeltmesini uygular ve önbellek sürümünü 200 yapar. Beklenen kaynak uyuşmazsa durur. Vercel'e otomatik yayın veya Neon'da veri değişikliği yapmaz.

Tek Enter ile sonraki satıra geçiş, Ayarlar panelinin tekrar açılması ve ortak hakediş kataloğunun yenilenmesi için önceki aday düzeltmeler korunmuştur. Tarayıcıda kullanıcı akışları ve iki yönetici ile bulut kaydı bu oturumda uçtan uca çalıştırılamadı.

14 Eylül 2026 kontrolünde canlı /api/health sürüm 197, veritabanı connected=true, şema ready=true döndü. Bu bağlantı kontrolüdür; V200'ün canlıda olduğu veya iki yönetici senaryosunun test edildiği anlamına gelmez. Güncel sunucu kaynaklarının tamamına erişilemediğinden bu rapor paketi yayımlanmadı.

Bu klasör tam canlı site yedeği, Neon veri dökümü veya Vercel ortam değişkenleri dışa aktarımı içermez. Gerçek veritabanı parolası, erişim anahtarı ve özel proje verisi eklenmemiştir.

## Doğrulama ve tekrar üretim

```sh
node V200_Firma_Hakedis/tests/report.test.mjs
node V200_Firma_Hakedis/generate-template.mjs
```

20 senaryo kontrolü ve 238 formül değerlendirmesi geçti. Beş sayfa adı, fiyat değişikliğinin kapağa taşınması, eksik fiyat, açık sıfır fiyat, önceki dönem boşlukları, mükerrer avans, sonradan değişen kesinti oranları, fiyat farkı ve kopya cephe kontrol edildi. Üretilen XLSX'in 12 paket parçasında ZIP CRC ve XML etiket bütünlüğü doğrulandı.

Kontroller JavaScript ortamında yapıldı; Excel/LibreOffice veya gerçek tarayıcıda açılış/görünüm denemesi yapılamadı. Testler kendi formül değerlendiricisini kullanır. İnceleme sırasında dosyanın hedef Excel sürümünde açılarak baskı ve hesap sonuçlarının da kontrol edilmesi gerekir.
