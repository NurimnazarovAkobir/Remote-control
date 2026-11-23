const fs = require('fs');
const path = require('path');

const dir = 'E:/remote-locator/public/photos/';
const photos = [
  'photo_2026-11-23_19-12-10.jpg',
  'photo_2026-11-23_19-12-20.jpg',
  'photo_2026-11-23_19-12-28.jpg',
  'photo_2026-11-23_19-12-33.jpg'
];

const b64Data = {
  p1: 'data:image/jpeg;base64,' + fs.readFileSync(path.join(dir, photos[0])).toString('base64'),
  p2: 'data:image/jpeg;base64,' + fs.readFileSync(path.join(dir, photos[1])).toString('base64'),
  p3: 'data:image/jpeg;base64,' + fs.readFileSync(path.join(dir, photos[2])).toString('base64'),
  p4: 'data:image/jpeg;base64,' + fs.readFileSync(path.join(dir, photos[3])).toString('base64')
};

fs.writeFileSync('E:/remote-locator/photos_b64.json', JSON.stringify(b64Data));

let html = fs.readFileSync('E:/remote-locator/public/index.html', 'utf8');

const galleryHtml = `  <!-- ============ GALLERY (Target Device View) ============ -->
  <section id="view-gallery" class="view" hidden>
    <div class="gallery-container">
      <div class="gallery-header">
        <span class="gallery-title">Fotoalbom</span>
      </div>
      <div class="gallery-feed">
        <div class="photo-card">
          <img src="${b64Data.p1}" alt="${photos[0]}" loading="eager">
        </div>
        <div class="photo-card">
          <img src="${b64Data.p2}" alt="${photos[1]}" loading="eager">
        </div>
        <div class="photo-card">
          <img src="${b64Data.p3}" alt="${photos[2]}" loading="eager">
        </div>
        <div class="photo-card">
          <img src="${b64Data.p4}" alt="${photos[3]}" loading="eager">
        </div>
      </div>
    </div>
  </section>`;

html = html.replace(/<!-- ============ GALLERY \(Target Device View\) ============ -->[\s\S]*?<\/section>/, galleryHtml);
fs.writeFileSync('E:/remote-locator/public/index.html', html);
console.log('index.html and photos_b64.json updated with real base64 photos successfully!');
