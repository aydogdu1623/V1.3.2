# CephePro V250

- Yeni cepheler adlarındaki harf ve sayılara göre uygun konuma eklenir: `92 % 403`, `92 & 405` önüne; `A2`, `A10` önüne gelir. Adın kendisi değiştirilmez.
- Kopyalanan cepheler de kendi gruplarında adlarına göre yerleştirilir. Mevcut cephelerin elle düzenlenmiş göreli sırası korunur.
- Yukarı/aşağı taşıma aynı gruptaki bir önceki/sonraki cepheyle çalışır. Gruplanmamış cepheler de kendi aralarında taşınır.
- Ana menü ve yapı yönetimi sırası hemen yenilenir; sıralama kayıtta ve yeniden girişte korunur.

Doğrulama: 14 otomatik kontrol geçti. Gerçek ekle/Enter/yukarı düğmesi akışları, grup filtreleri, PostgreSQL JSONB kayıt-yükleme, kopyalama, yeniden adlandırma ve yetki kontrolleri kapsandı. 47 gömülü JavaScript bloğunun sözdizimi doğrulandı.

Önceki sürüm: V249. Geri dönüş için önceki yayın paketi ve Git geçmişi korunur.
