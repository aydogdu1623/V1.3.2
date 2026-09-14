# CephePro firma hakedişi – otomatik rapor düzenlemesi

Bu klasör canlı V197'nin ön yüzü için hazırlanmış bir değişiklik paketidir. Canlıya yayınlanmadı.
GitHub deposunun bu klasör dışındaki dosyaları eski V1.3.2 sürümüne aittir.
Bu arşiv güncel sunucunun tam yedeği değildir; kök dizini olduğu gibi Vercel'e yüklemeyin.

## Değişen davranış
- Firma raporu üç Excel sayfası oluşturur: Hakediş Kapağı & İcmal, Detaylı Hakediş Cetveli, Sözleşme & Firma Bilgileri.
- Firma ve sözleşme penceresinde hakediş tarihi, dönem aralığı, sözleşme bedeli, KDV, KDV tevkifatı, stopaj, teminat, avans ve fiyat farkı alanları bulunur.
- Alanlar sitede girildiğinde bir sonraki Excel indirmesine aktarılır. Daha önce indirilen Excel dosyası siteyi arka planda izlemez.
- Önceden boş kalmış firma alanları, kendi kaydınızdaki güncel proje bilgileriyle tamamlanır.
- Tüm cepheler, A1 GC2_Kopya dahil, ayrı kimlikleriyle rapora girer; aynı isimdeki imalatlar cepheler arasında birleştirilmez.
- Birim fiyatlar sitedeki finans kayıtlarından tam iş kalemi kimliği ile alınır. Adı farklı kalemlerin fiyatı tahmin edilmez.
- İş kalemi miktarı ve fiyatı sitede güncellendiğinde rapor yeniden oluşturulur. Önceki hakedişlerin miktarları ve tutarları kendi kayıtlarından gelir.
- Eksik fiyat ve kesinti oranları boş bırakılır. Sıfır, geçerli bir kullanıcı girdisidir; bilinmeyen değerlerle eşit tutulmaz.
- Hesaplanan KDV eklenir. KDV tevkifatı hesaplanan KDV üzerinden; stopaj ve teminat seçilen matrahlar üzerinden hesaplanır.
- Boş matrah alanlarında bu dönem brütü kullanılır. Oranlar, fiyat farkı ve avans bilinmiyorsa net ödeme hesaplanmaz; uygulanmıyorsa kullanıcı 0 girer.
- Paylaşılan kaydın raporunda diğer adminin firma bilgileri kullanılmaz. Yeni rapor bilgileri hakedişin JSON kaydına eklenir.
- Paylaşılan kayıt listesi her hakediş sekmesi açılışında yenilenir.
- Önceki V198 Enter ve pencere görünürlüğü düzeltmeleri entegre edilmiştir.
- Excel lacivert başlıklar, gri kenarlıklar, para ve yüzde biçimleri, dondurulmuş başlıklar, yazdırma ayarları ve imza alanları içerir.

## Dosyalar
- assets/claims-v182.js: V197 hakediş dosyasının düzenlenmiş tamamı.
- report-engine.js: Excel rapor motoru; aynı kod ana hakediş dosyasının başında gömülüdür.
- apply-v199.mjs: Tam V197 kaynak projesine ön yüz değişikliklerini uygulayan, önce yedek oluşturan betik.
- tests/report-model.test.mjs: Kaynak eşleştirme ve Excel hücre/formül yapısı testleri.

## Uygulama
Güncel sunucu kaynakları ve bağımlılık dosyaları bulunan V197 projesi üzerinde:
    node V199_Hakedis_Duzeltmesi/apply-v199.mjs /tam/V197/proje/yolu
Betik otomatik yayın yapmaz. Beklenen Ayarlar kaynak yapısı eşleşmezse dosya yazmadan durur.
Yeni meta alanlarının canlı /api/claims tarafından korunması, iki ayrı admin hesabı ile kaydetme/açma ve gerçek Excel açılışı yayından önce doğrulanmalıdır.
Mevcut oturumda çalışma ortamı ve tarayıcı kullanılamadığı için bu kontroller yapılmamıştır.

## Test sonucu
    node V199_Hakedis_Duzeltmesi/tests/report-model.test.mjs
52 kontrol geçti: 13 davranış kontrolü ve 39 hücre/formül başvurusu kontrolü.
Testler hafif bir ExcelJS arayüz taklidi kullanır; Excel dosyasını oluşturan gerçek kitaplık, Excel hesaplama motoru veya tarayıcı testi değildir.
Türkçe ondalıklar, boş / sıfır ayrımı, kopya cephe, eski fiyatların korunması, eksik önceki hakediş ve kullanıcılar arasında bilgi karışmaması denetlenir.

## Kapsam
Bu kod yalnız firma raporunun mali özetini değiştirir. Mevcut taşeron Excel şablonu korunur.
Excel'deki tutarlar sözleşme, imalat onayı ve girilen kesinti parametrelerine bağlıdır.
Bakanlık veya belirli bir işveren tarafından onaylanmış resmi belge olduğu iddia edilmez.
Şifre, erişim anahtarı, canlı kullanıcı bilgileri ve Neon kayıt dökümü içermez.
