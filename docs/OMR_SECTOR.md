# OMR sektoru: qısa qiymətləndirmə

**Məqsəd:** Dövlət / DİM tipli standart şablonun tam hazır “açıq paket” tapılmaması halında praktik yollar.

## Variantlar

1. **OMRChecker + öz JSON şablon** (cari yanaşma)  
   - **Üstünlük:** Kod bazasına inteqrasiya, lisenziya sadə.  
   - **Mənfi:** Rəsmi DİM piksel uyğunluğu zəmanəti yoxdur; şablon sizin ölçülərinizlə sinxron olmalıdır.

2. **Ticari skaner ekosistemləri** (Remark, Scantron, yerli provayder)  
   - **Üstünlük:** Dəstək, sertifikatlaşdırılmış vərəqlər.  
   - **Mənfi:** Lisenziya, vendor lock-in, API inteqrasiya müqaviləsi.

3. **Öz DİM-yaxın şablon**  
   - **Üstünlük:** Vizual və hüquqi nəzarət.  
   - **Mənfi:** Rəsmi texniki spesifikasiya olmadan “uyğunluq” müştəri ilə təsdiqlənməlidir.

## Tövsiyə

1–2 həftəlik spike: bir açıq mənbə OMR generator nümunəsi + lisenziya yoxlanışı + OMRChecker koordinat importu. Nəticə əsasında ya (1) saxlanılır, ya (2) üçün tender texniki təsvir hazırlanır.
