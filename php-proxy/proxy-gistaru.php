<?php
/**
 * proxy-gistaru.php — relay overlay RDTR Interaktif GISTARU.
 *
 * Kenapa file ini perlu ada:
 *
 *   1. Browser DILARANG mengganti header User-Agent dan Referer pada request
 *      <img> maupun fetch. Sedangkan gistaru-proxy.atrbpn.go.id menolak setiap
 *      request yang Referer-nya bukan situs GISTARU sendiri dengan
 *      403 "Akses Tidak Sah." Jadi identitas itu hanya bisa disisipkan di
 *      server.
 *
 *   2. Cloudflare Workers dan Netlify Functions keduanya TIDAK meneruskan
 *      header Referer pada subrequest fetch. Teruji 2026-10-30: set header yang
 *      sama persis dari Node/curl -> 200 image/png, dari kedua platform
 *      tersebut -> 403. PHP curl dibebaskan dari larangan itu, sehingga file
 *      inilah jalur yang benar-benar berfungsi.
 *
 *   3. Mengakses /arcgis/rest/services secara langsung selalu dibalas
 *      {"error":{"code":499,"message":"Token Required"}}. Token disediakan oleh
 *      proxy resmi mereka, jadi URL tujuan WAJIB berbentuk
 *      https://gistaru-proxy.atrbpn.go.id/proxy.ashx?<url ArcGIS>.
 *
 * Pakai: GET proxy-gistaru.php?url=<urlencode(target)>
 */

// CORS. Gambar tile maupun JSON metadata sama-sama dibolehkan; gambar <img>
// sebenarnya tak menuntut CORS, tetapi metadata dibaca lewat fetch.
header('Access-Control-Allow-Origin: *');

$url = isset($_GET['url']) ? $_GET['url'] : '';

// Hanya layanan GISTARU. Bentuk proxy resmi (gistaru-proxy.atrbpn.go.id)
// ikut diizinkan karena URL-nya memuat tujuan akhir gistaru.atrbpn.go.id di
// dalam query string.
$boleh = strpos($url, 'gistaru.atrbpn.go.id') !== false
      || strpos($url, 'gistaru-proxy.atrbpn.go.id') !== false;

if ($url === '' || !$boleh) {
    http_response_code(400);
    header('Content-Type: text/plain; charset=utf-8');
    exit('Invalid URL');
}

$ch = curl_init();
curl_setopt_array($ch, [
    CURLOPT_URL            => $url,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    // Tekan tombol minta ulang bila upstream menggantung; tile lain tetap
    // jalan tanpa menunggu.
    CURLOPT_TIMEOUT        => 30,
    CURLOPT_CONNECTTIMEOUT => 10,
    // '' membuat curl menambahkan Accept-Encoding lalu MENGURAI responsnya.
    // Tanpa ini, JSON metadata yang digzip akan terusir ke browser dalam
    // bentuk mentah dan gagal diparse.
    CURLOPT_ENCODING       => '',
    // Meniru Chrome, seperti permintaan yang dikirim dari halaman GISTARU.
    CURLOPT_USERAGENT      => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    CURLOPT_HTTPHEADER     => [
        // Inilah header yang menentukan: tanpanya balasannya 403
        // "Akses Tidak Sah.", dengannya 200 image/png.
        'Referer: https://gistaru.atrbpn.go.id/rdtrinteraktif/',
        'Origin: https://gistaru.atrbpn.go.id',
        'Accept: */*'
    ]
]);

$data = curl_exec($ch);
$code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
$type = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
$err  = curl_error($ch);
curl_close($ch);

if ($code === 200 && $data !== false && $data !== '') {
    // Content-Type diambil dari upstream: tile tetap image/png, sementara
    // metadata ?f=json ikut benar sehingga pembacaan extent/zoom lancar.
    header('Content-Type: ' . ($type ? $type : 'image/png'));
    // Tile PNG tidak pernah berubah. Browser menyimpannya, jadi panning dan
    // zoom terasa lancar dan tidak menghantam server GISTARU berulang kali.
    header('Cache-Control: public, max-age=86400');
    echo $data;
    exit;
}

http_response_code($code > 0 ? $code : 502);
header('Content-Type: text/plain; charset=utf-8');
echo 'Error: ' . ($code > 0 ? $code : 'upstream') . ($err !== '' ? ' (' . $err . ')' : '');
