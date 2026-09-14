# CephePro V201 — Seçili firma hakedişini beş sayfalı Excel'e aktar

Bu paket, Firma Hakedişi ekranındaki **Excel ve Ekleri İndir** düğmesini istenen beş sayfalı rapora bağlayan güncellemedir. Canlı sitede henüz yayımlanmamıştır.

## Kullanıcı akışı

1. Firma Hakedişi ekranında hakedişi seçin.
2. Firma/sözleşme bilgilerini ve dönem miktarlarını girin; tutanak ve kesintileri ekleyin.
3. Excel ve Ekleri İndir düğmesine basın.
4. Ek yoksa `Firma_Hakedis_02_2026-09.xlsx` gibi bir Excel iner. Ek varsa aynı Excel ve yalnız bu hakedişin ekleri tek ZIP içinde iner.

Dosya tam olarak şu sayfaları içerir:
- Hakediş İcmali (Kapak)
- Sözleşme Metrajı
- Hakediş Cetveli
- Saha Tutanakları
- Kesintiler ve Cezalar

Proje, firma, sözleşme ve dönem bilgileri kapakta; iş kalemleri sözleşme/metraj sayfalarında; tutanak numarası ve ek işler Saha Tutanakları'nda; kesintiler son sayfada görünür. Sayfalar arası hesap bağlantıları formüllüdür. İstenen lacivert/mavi tasarım, TL biçimleri, zebra satırlar, sabit başlıklar ve imza blokları korunur.

Her indirme seçili hakedişin verilerinden yeniden oluşturulur. Önceden indirilmiş Excel'in siteyle sürekli veri bağlantısı bulunmaz.

## Dönemlerin doğru ayrılması

- Seçim hakedişin benzersiz kimliğine göre yapılır; aynı ayda iki hakediş birbirine karışmaz.
- Önceki miktarlar seçili hakedişten önceki kayıtlı hakedişlerden toplanır. Dönem tutarına yeniden eklenmez.
- Yeni hakedişe öncekinin avansı, fiyat farkı, matrahı veya tarihleri taşınmaz.
- Dönem başlangıç/bitiş bilgisi girilmemişse seçilen ayın ilk/son günü kullanılır. Hakediş tarihi ayrıca girilen bilgidir; uydurulmaz.
- Görüntülenen başka yöneticinin hakedişi indiriliyorsa kayıt buluttan yenilenir; o kaydın firma ve sözleşme bilgileri kullanılır.
- Kaydedilen yeni firma hakedişinde raporun sözleşme bilgileri de saklanır.
- Yalnız seçili hakedişin tutanakları, kesintileri ve ekleri pakete alınır.
- A1 GC2_Kopya ayrı cephe olarak korunur.
- İndirme hazırlanırken seçim veya girişler değişirse yanlış dosya indirilmez; yeniden indirme istenir.
- Bozuk ek sessizce atlanmaz; dosya adıyla hata gösterilir. Düğme hata sonrasında yeniden kullanılabilir.

KDV %20 ve teminat %5 başlangıç değerleri değiştirilebilir. Yeni dönem için avans, fiyat farkı ve isteğe bağlı stopaj/tevkifat başlangıcı 0'dır; başka dönemin tutarı devralınmaz. Mevcut açık bilgiler korunur. Başka yöneticinin eski arşivinde eksik oranlar tahmin edilmez.

Bu formatta cetvel fiyatı Sözleşme Metrajı sayfasından bağlıdır. Döneme özel fiyat sözleşmeden farklıysa kontrol notunda belirtilir; ödeme cetveli sözleşme fiyatıyla hesaplanır. Sözleşme birim fiyatının kaynağı firmanın finansal fiyat tablosudur. Eksik sözleşme fiyatı uydurulmaz; onaylı fiyatın sitedeki kaynakta tamamlanması gerekir.

## Paketi uygulama

Güncel Vercel projesinin tüm kaynakları bilgisayarınızda bulunmalıdır. Paketin kendisi tam site/Neon yedeği değildir.

```sh
node V201_Firma_Excel_Entegrasyonu/tests/report.test.mjs
node V201_Firma_Excel_Entegrasyonu/apply-v201.mjs /tam/guncel-cephepro-projesi
```

Uygulayıcı:
- Güncel `api/claims.js` ve beklenen Ayarlar kodunu arar; uyumsuz kaynakta durur.
- Değişecek iki ön yüz dosyasının yedeğini alır.
- `assets/claims-v182.js` dosyasını günceller.
- Ayarlar panelinin hakedişten sonra tekrar açılması düzeltmesini uygular.
- Script önbellek sürümünü 201 yapar.

Sonrasında projenin mevcut Vercel yayın yöntemiyle önce önizleme oluşturulup kontrol edilmelidir. Uygulayıcı otomatik yayın veya Neon veri değişikliği yapmaz. Vercel proje adı: cephepro-v1-3-5-cloud.

Paket dışında eski depo kökünden alınan kaynakları güncel API yerine kullanmayın. Bu arşivde üretim veritabanı parolası, erişim anahtarı veya gerçek proje mali verileri bulunmaz.

## Dosyalar

- `assets/claims-v182.js`: mevcut siteyle bütünleşik hakediş kodu.
- `report-engine.js`: dönem verisini hazırlayan ve beş sayfalı Excel üreten modül.
- `apply-v201.mjs`: kaynak uyumluluğunu kontrol eden uygulayıcı.
- `CephePro_Firma_Hakedis_5_Sayfa_Sablon.xlsx`: önceki teslimdeki boş örnek şablon; site indirmesi bu boş dosyayı indirmez, seçili veriden yeniden üretir.
- `generate-template.mjs`, `tools/`, `tests/`: şablon üretimi ve tekrar çalıştırılabilir kontroller.

## Doğrulama durumu

20 rapor hesap senaryosu ve 238 formül değerlendirmesine ek olarak 18 dönem aktarımı/indirme senaryosu geçti. Gerçek düğme fonksiyonu, tarayıcı dosya indirme işlemleri taklit edilerek çalıştırıldı: ekli/eksiz indirme, seçim değişikliği, bozuk ek, tekrar tıklama ve hata sonrası düğmenin yeniden kullanılması kontrol edildi.

Excel/LibreOffice görünümü, gerçek tarayıcı ve canlı oturumla uçtan uca test bu ortamda yapılamadı. Önizleme kontrolünde iki farklı firma hakedişini sırayla indirip kapak numarası, dönem, toplamlar ve eklerin doğru olduğunu doğrulayın.

14 Eylül 2026'da canlı site V197 idi. Güncel canlı sunucu dosyalarının tamamına bu bağlantıdan erişilemediği için V201 canlıya yayımlanmadı. Bu sınırlama bir kullanıcı onayı talebi değildir; yayınlanacak tam kaynak dosyaları mevcut değil.

Bu belge kurumsal rapor düzenidir; resmî ÇŞB/FIDIC onayı veya sertifikası iddiası taşımaz. Kullanıcının eklediği önceki Excel okunamadığı için onun gerçek verileri pakete aktarılmamıştır.
