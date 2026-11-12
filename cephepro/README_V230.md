# CephePro V230

## Düzeltmeler
- Cephe Planı başlangıç, bitiş ve süresi iş kalemleri ve yeni Excel/Word/PDF raporları için ortak kaynaktır. Cephe planını değiştirip Kaydet'e bastığınızda tüm iş kalemleri yeni tarihleri kullanır.
- Cephe sırası her cephede displayOrder alanıyla saklanır ve buluttan tekrar yüklenirken geri uygulanır.
- V229 İngilizce rapor/hakediş indirme düzeltmeleri dahildir. Çeviri modeli yoksa özel açıklamalar özgün dilde kalabilir; indirme devam eder.
- Daha önce indirilmiş belgeler değişmez; güncel tarihleri almak için yeniden rapor indirin.

## Kurulum
Mevcut GitHub deposunda cephepro klasörünü bu paketteki cephepro klasörüyle güncelleyin. Vercel Root Directory: cephepro, Framework: Other. Mevcut DATABASE_URL ve proje bağlantılarını koruyun. Paket bağlantı şifresi veya kullanıcı verisi içermez. Yeni veritabanı kurulumu veya veri silme gerekmez.

## Doğrulama
npm ci
node --test tests/structure-state.test.mjs tests/reports-poz.test.mjs tests/i18n.test.mjs tests/local-translation.test.mjs tests/claims-refresh.test.mjs tests/work-items.test.mjs

Tarih testi gerçek XLSX dosyasını yeniden açar; PDF/Word ortak HTML ve tablo verisini kontrol eder. Sıralama testi PostgreSQL uyumlu PGlite üzerinde gerçek JSONB yazma/okuma yapar. Üretim kullanıcı verileri üzerinde işlem yapmaz.
