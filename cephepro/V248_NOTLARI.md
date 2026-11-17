# V248 — Makrosuz Excel grafiği

Genel rapor `.xlsx` olarak indirilir. Bu rapora VBA eklenmez; makro izni gerekmez.

Ada, tek cephe, seçili cepheler ve tablodaki filtreler aynı hesaplama alanını günceller. Uygun iş kalemleri araya boşluk bırakmadan solda toplanır. Kategori aralığının kapasitesi sabit tutulduğu için filtreleme sütunları kalınlaştırmaz. Kullanılmayan konumlardaki değerler `#N/A` olduğundan bu konumlarda sütun veya yüzde etiketi çizilmez. Grafik zemini ve sağa uzayan çizgiler kaldırılmıştır.

Teknik sınır: Excel'in grafik nesnesinin şeffaf seçim dikdörtgeni toplam rapor kapasitesini korur. Makrosuz çözüm nesnenin dış ölçüsünü değiştirmez; görünen sütunlar ve etiketler seçime göre solda azalır veya sağa çoğalır. Dış nesne ölçüsünü otomatik değiştiren V247 sürümü Git geçmişinde korunmuştur.

Birden fazla cephe için Grafik Seçimi sayfasında Evet seçin; Rapor sayfasındaki Cephe alanını Seçili Cepheler yapın. Tümünü görmek için ada ve cephe seçimlerini Tüm olarak değiştirip tablo filtrelerini temizleyin.

Kontroller: Altı dilde gerçek Excel dışa aktarımı, Word/PDF rapor kontrolleri, formül yorumlayıcısında ada/cephe/çoklu seçim, AutoFilter, boş kesişim ve metraj güncellemesi. LibreOffice'te makrosuz yeniden hesaplama ve grafik görsel karşılaştırması yapıldı. Masaüstü Microsoft Excel bu ortamda çalıştırılmadı.
