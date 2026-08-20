package id.irvan.gpsmapcamera;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;

public class MainActivity extends Activity {
    private static final String TAG = "GPSMapCamera";
    private static final int REQUEST_FILE_CHOOSER = 2101;
    private static final int REQUEST_CAMERA_PERMISSION = 2102;
    private static final int REQUEST_LOCATION_PERMISSION = 2103;
    private static final String APP_ORIGIN = "https://app.local";

    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private WebChromeClient.FileChooserParams pendingFileChooserParams;
    private Uri cameraOutputUri;
    private GeolocationPermissions.Callback pendingGeoCallback;
    private String pendingGeoOrigin;
    private boolean nativeLocationPending;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        startWebApp(savedInstanceState);
    }

    private void startWebApp(Bundle savedInstanceState) {
        destroyWebView();
        try {
            configureSystemBars();
            PackageInfo provider = WebView.getCurrentWebViewPackage();
            if (provider == null) throw new IllegalStateException("Android System WebView tidak tersedia atau dinonaktifkan.");
            Log.i(TAG, "Starting with WebView " + provider.packageName + " " + provider.versionName);

            webView = new WebView(this);
            webView.setBackgroundColor(Color.rgb(244, 248, 252));
            configureWebView();
            setContentView(webView);

            boolean restored = savedInstanceState != null && webView.restoreState(savedInstanceState) != null;
            if (!restored) webView.loadUrl(APP_ORIGIN + "/index.html#/home");
        } catch (Throwable error) {
            showStartupFailure(error);
        }
    }

    private void showStartupFailure(Throwable error) {
        Log.e(TAG, "Application startup failed", error);
        destroyWebView();
        setContentView(StartupRecoveryView.create(this, error, () -> startWebApp(null)));
    }

    private void destroyWebView() {
        WebView current = webView;
        webView = null;
        if (current == null) return;
        try { if (current.getParent() instanceof ViewGroup) ((ViewGroup) current.getParent()).removeView(current); }
        catch (RuntimeException error) { Log.w(TAG, "WebView detach failed", error); }
        try { current.stopLoading(); }
        catch (RuntimeException error) { Log.w(TAG, "WebView stop failed", error); }
        try { current.removeJavascriptInterface("AndroidBridge"); }
        catch (RuntimeException error) { Log.w(TAG, "WebView bridge cleanup failed", error); }
        try { current.setWebChromeClient(null); }
        catch (RuntimeException error) { Log.w(TAG, "WebView client cleanup failed", error); }
        try { current.destroy(); }
        catch (RuntimeException error) { Log.w(TAG, "WebView destroy failed", error); }
    }

    @SuppressWarnings("deprecation")
    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " GPSMapCamera/" + BuildConfig.VERSION_NAME + " (" + BuildConfig.APPLICATION_ID + ")");

        webView.addJavascriptInterface(new NativeBridge(), "AndroidBridge");
        webView.setWebViewClient(new LocalAssetWebViewClient());
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                if (params.isCaptureEnabled() && !hasPermission(Manifest.permission.CAMERA)) {
                    pendingFileChooserParams = params;
                    requestPermissions(new String[]{Manifest.permission.CAMERA}, REQUEST_CAMERA_PERMISSION);
                    return true;
                }
                launchFileChooser(params);
                return true;
            }

            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                if (hasLocationPermission()) {
                    callback.invoke(origin, true, false);
                } else {
                    pendingGeoOrigin = origin;
                    pendingGeoCallback = callback;
                    requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, REQUEST_LOCATION_PERMISSION);
                }
            }
        });
    }

    private void configureSystemBars() {
        Window window = getWindow();
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.rgb(244, 248, 252));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(true);
            WindowInsetsController controller = window.getInsetsController();
            if (controller != null) controller.setSystemBarsAppearance(
                    WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS,
                    WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
            );
        } else {
            window.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        }
    }

    private void launchFileChooser(WebChromeClient.FileChooserParams params) {
        boolean cameraOnly = params != null && params.isCaptureEnabled();
        try {
            if (cameraOnly) {
                File cameraDirectory = new File(getCacheDir(), "camera");
                if (!cameraDirectory.exists() && !cameraDirectory.mkdirs()) throw new IOException("Folder kamera gagal dibuat.");
                File cameraFile = new File(cameraDirectory, "original-" + System.currentTimeMillis() + ".jpg");
                cameraOutputUri = ShareFileProvider.uriForFile(this, cameraFile);
                Intent cameraIntent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                cameraIntent.putExtra(MediaStore.EXTRA_OUTPUT, cameraOutputUri);
                cameraIntent.setClipData(ClipData.newRawUri("GPS Map Camera", cameraOutputUri));
                cameraIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                startActivityForResult(cameraIntent, REQUEST_FILE_CHOOSER);
                return;
            }

            Intent picker = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            picker.addCategory(Intent.CATEGORY_OPENABLE);
            picker.setType("image/*");
            picker.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params != null && params.getMode() == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE);
            picker.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
            startActivityForResult(Intent.createChooser(picker, getString(R.string.choose_photo)), REQUEST_FILE_CHOOSER);
        } catch (Exception error) {
            completeFileChooser(null);
            toast(getString(R.string.camera_open_failed));
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQUEST_FILE_CHOOSER) return;
        if (resultCode != RESULT_OK) {
            completeFileChooser(null);
            cameraOutputUri = null;
            return;
        }

        if (cameraOutputUri != null) {
            Uri captured = cameraOutputUri;
            completeFileChooser(new Uri[]{captured});
            copyCameraOriginalToGallery(captured);
            cameraOutputUri = null;
            return;
        }

        ArrayList<Uri> selected = new ArrayList<>();
        if (data != null && data.getClipData() != null) {
            ClipData clip = data.getClipData();
            for (int index = 0; index < clip.getItemCount(); index++) {
                Uri uri = clip.getItemAt(index).getUri();
                selected.add(uri);
                persistReadPermission(data, uri);
            }
        } else if (data != null && data.getData() != null) {
            selected.add(data.getData());
            persistReadPermission(data, data.getData());
        }
        completeFileChooser(selected.isEmpty() ? null : selected.toArray(new Uri[0]));
    }

    private void persistReadPermission(Intent data, Uri uri) {
        try {
            int flags = data.getFlags() & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            getContentResolver().takePersistableUriPermission(uri, flags);
        } catch (SecurityException ignored) {
            // Some gallery providers grant temporary access only; WebView can still read it now.
        }
    }

    private void completeFileChooser(Uri[] result) {
        if (fileCallback != null) fileCallback.onReceiveValue(result);
        fileCallback = null;
        pendingFileChooserParams = null;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQUEST_CAMERA_PERMISSION) {
            if (hasPermission(Manifest.permission.CAMERA) && pendingFileChooserParams != null) launchFileChooser(pendingFileChooserParams);
            else {
                completeFileChooser(null);
                toast(getString(R.string.camera_permission_denied));
            }
        }
        if (requestCode == REQUEST_LOCATION_PERMISSION) {
            boolean granted = hasLocationPermission();
            if (pendingGeoCallback != null) pendingGeoCallback.invoke(pendingGeoOrigin, granted, false);
            pendingGeoCallback = null;
            pendingGeoOrigin = null;
            if (nativeLocationPending) {
                nativeLocationPending = false;
                if (granted) requestOneLocation();
                else sendLocationError(getString(R.string.location_permission_denied));
            }
        }
    }

    private boolean hasPermission(String permission) {
        return checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean hasLocationPermission() {
        return hasPermission(Manifest.permission.ACCESS_FINE_LOCATION) || hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION);
    }

    private void requestNativeLocation() {
        runOnUiThread(() -> {
            if (!hasLocationPermission()) {
                nativeLocationPending = true;
                requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, REQUEST_LOCATION_PERMISSION);
            } else requestOneLocation();
        });
    }

    @SuppressWarnings("MissingPermission")
    private void requestOneLocation() {
        LocationManager manager = (LocationManager) getSystemService(LOCATION_SERVICE);
        boolean fine = hasPermission(Manifest.permission.ACCESS_FINE_LOCATION);
        String provider = fine && manager.isProviderEnabled(LocationManager.GPS_PROVIDER)
                ? LocationManager.GPS_PROVIDER
                : manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER) ? LocationManager.NETWORK_PROVIDER : null;
        if (provider == null) {
            sendLocationError(getString(R.string.location_disabled));
            return;
        }

        AtomicBoolean completed = new AtomicBoolean(false);
        Handler timeoutHandler = new Handler(Looper.getMainLooper());
        Runnable timeout = () -> {
            if (completed.compareAndSet(false, true)) sendLocationError(getString(R.string.location_timeout));
        };
        timeoutHandler.postDelayed(timeout, 22000);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            CancellationSignal cancellation = new CancellationSignal();
            timeoutHandler.postDelayed(cancellation::cancel, 22000);
            manager.getCurrentLocation(provider, cancellation, getMainExecutor(), location -> {
                if (location != null && completed.compareAndSet(false, true)) {
                    timeoutHandler.removeCallbacks(timeout);
                    sendLocationSuccess(location);
                }
            });
        } else {
            LocationListener listener = new LocationListener() {
                @Override public void onLocationChanged(Location location) {
                    if (completed.compareAndSet(false, true)) {
                        timeoutHandler.removeCallbacks(timeout);
                        manager.removeUpdates(this);
                        sendLocationSuccess(location);
                    }
                }
                @Override public void onProviderEnabled(String value) {}
                @Override public void onProviderDisabled(String value) {}
                @Override public void onStatusChanged(String value, int status, Bundle extras) {}
            };
            manager.requestSingleUpdate(provider, listener, Looper.getMainLooper());
        }
    }

    private void sendLocationSuccess(Location location) {
        try {
            JSONObject payload = new JSONObject();
            payload.put("latitude", location.getLatitude());
            payload.put("longitude", location.getLongitude());
            payload.put("accuracy", location.hasAccuracy() ? location.getAccuracy() : JSONObject.NULL);
            payload.put("altitude", location.hasAltitude() ? location.getAltitude() : JSONObject.NULL);
            payload.put("speed", location.hasSpeed() ? location.getSpeed() : JSONObject.NULL);
            payload.put("heading", location.hasBearing() ? location.getBearing() : JSONObject.NULL);
            String script = "window.__nativeLocationSuccess(" + JSONObject.quote(payload.toString()) + ")";
            evaluateJavascriptSafely(script);
        } catch (Exception error) {
            sendLocationError(error.getMessage());
        }
    }

    private void sendLocationError(String message) {
        String script = "window.__nativeLocationError(" + JSONObject.quote(message == null ? getString(R.string.location_failed) : message) + ")";
        evaluateJavascriptSafely(script);
    }

    private void evaluateJavascriptSafely(String script) {
        runOnUiThread(() -> {
            WebView current = webView;
            if (current == null) return;
            try {
                current.evaluateJavascript(script, null);
            } catch (RuntimeException error) {
                Log.w(TAG, "JavaScript bridge call ignored because WebView is unavailable", error);
            }
        });
    }

    private void copyCameraOriginalToGallery(Uri sourceUri) {
        new Thread(() -> {
            try (InputStream input = getContentResolver().openInputStream(sourceUri)) {
                if (input == null) return;
                saveStreamToGallery(input, "Original-" + System.currentTimeMillis() + ".jpg", "Original");
            } catch (Exception ignored) {
                // The project still keeps a local source copy if MediaStore saving is unavailable.
            }
        }, "save-camera-original").start();
    }

    private Uri saveBytesToGallery(byte[] bytes, String fileName, String subfolder) throws IOException {
        try (InputStream input = new ByteArrayInputStream(bytes)) {
            return saveStreamToGallery(input, sanitizeFileName(fileName), subfolder);
        }
    }

    private Uri saveStreamToGallery(InputStream input, String fileName, String subfolder) throws IOException {
        ContentResolver resolver = getContentResolver();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentValues values = new ContentValues();
            values.put(MediaStore.Images.Media.DISPLAY_NAME, fileName);
            values.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
            values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/GPS Map Camera/" + subfolder);
            values.put(MediaStore.Images.Media.IS_PENDING, 1);
            Uri uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
            if (uri == null) throw new IOException("MediaStore menolak file.");
            try (OutputStream output = resolver.openOutputStream(uri)) {
                if (output == null) throw new IOException("Output gambar tidak tersedia.");
                copy(input, output);
            } catch (Exception error) {
                resolver.delete(uri, null, null);
                throw error;
            }
            values.clear();
            values.put(MediaStore.Images.Media.IS_PENDING, 0);
            resolver.update(uri, values, null, null);
            return uri;
        }

        File pictures = hasPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE)
                ? Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES)
                : getExternalFilesDir(Environment.DIRECTORY_PICTURES);
        File directory = new File(pictures, "GPS Map Camera/" + subfolder);
        if (!directory.exists() && !directory.mkdirs()) directory = getExternalFilesDir(Environment.DIRECTORY_PICTURES);
        File destination = uniqueFile(directory, fileName);
        try (OutputStream output = new FileOutputStream(destination)) { copy(input, output); }
        Intent scan = new Intent(Intent.ACTION_MEDIA_SCANNER_SCAN_FILE, Uri.fromFile(destination));
        sendBroadcast(scan);
        return Uri.fromFile(destination);
    }

    private static void copy(InputStream input, OutputStream output) throws IOException {
        byte[] buffer = new byte[64 * 1024];
        int read;
        while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
        output.flush();
    }

    private File uniqueFile(File directory, String name) {
        File file = new File(directory, name);
        if (!file.exists()) return file;
        String base = name.replaceFirst("\\.[^.]+$", "");
        String extension = name.substring(base.length());
        return new File(directory, base + "-" + System.currentTimeMillis() + extension);
    }

    private String sanitizeFileName(String value) {
        String clean = value == null ? "GPSMapCamera.jpg" : value.replaceAll("[^a-zA-Z0-9._-]", "-");
        return clean.toLowerCase(Locale.ROOT).endsWith(".jpg") ? clean : clean + ".jpg";
    }

    private void shareBytes(byte[] bytes, String fileName) throws IOException {
        File directory = new File(getCacheDir(), "shared");
        if (!directory.exists() && !directory.mkdirs()) throw new IOException("Folder share gagal dibuat.");
        File file = new File(directory, sanitizeFileName(fileName));
        try (OutputStream output = new FileOutputStream(file)) { output.write(bytes); }
        Uri uri = ShareFileProvider.uriForFile(this, file);
        Intent share = new Intent(Intent.ACTION_SEND);
        share.setType("image/jpeg");
        share.putExtra(Intent.EXTRA_STREAM, uri);
        share.setClipData(ClipData.newRawUri("GPS Map Photo", uri));
        share.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        runOnUiThread(() -> startActivity(Intent.createChooser(share, getString(R.string.share_photo))));
    }

    private byte[] decodeDataUrl(String dataUrl) {
        int comma = dataUrl == null ? -1 : dataUrl.indexOf(',');
        if (comma < 0) throw new IllegalArgumentException("Data gambar tidak valid.");
        return Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT);
    }

    private void toast(String message) {
        runOnUiThread(() -> Toast.makeText(this, message, Toast.LENGTH_LONG).show());
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        if (webView != null) {
            try { webView.saveState(outState); }
            catch (RuntimeException error) { Log.w(TAG, "WebView state could not be saved", error); }
        }
        super.onSaveInstanceState(outState);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        destroyWebView();
        super.onDestroy();
    }

    public final class NativeBridge {
        @JavascriptInterface public String getPlatform() { return "android"; }
        @JavascriptInterface public String getAppVersion() { return BuildConfig.VERSION_NAME; }
        @JavascriptInterface public void reportReady() { Log.i(TAG, "WEB_APP_READY " + BuildConfig.VERSION_NAME); }
        @JavascriptInterface public void requestLocation() { requestNativeLocation(); }

        @JavascriptInterface
        public void saveImage(String dataUrl, String fileName) {
            new Thread(() -> {
                try {
                    Uri saved = saveBytesToGallery(decodeDataUrl(dataUrl), fileName, "Exported");
                    toast(getString(R.string.photo_saved));
                    String script = "window.dispatchEvent(new CustomEvent('native-save-complete',{detail:" + JSONObject.quote(saved.toString()) + "}))";
                    evaluateJavascriptSafely(script);
                } catch (Exception error) {
                    toast(getString(R.string.photo_save_failed) + ": " + error.getMessage());
                }
            }, "save-exported-photo").start();
        }

        @JavascriptInterface
        public void shareImage(String dataUrl, String fileName) {
            new Thread(() -> {
                try { shareBytes(decodeDataUrl(dataUrl), fileName); }
                catch (Exception error) { toast(getString(R.string.share_failed) + ": " + error.getMessage()); }
            }, "share-photo").start();
        }

        @JavascriptInterface
        public void openAppSettings() {
            runOnUiThread(() -> {
                Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName()));
                startActivity(intent);
            });
        }
    }

    private final class LocalAssetWebViewClient extends WebViewClient {
        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            String reason = detail.didCrash()
                    ? "Renderer Android System WebView berhenti secara tidak terduga."
                    : "Renderer Android System WebView dihentikan karena perangkat kekurangan memori.";
            Log.e(TAG, reason + " Priority at exit: " + detail.rendererPriorityAtExit());
            if (view == webView) runOnUiThread(() -> showStartupFailure(new IllegalStateException(reason)));
            else {
                try { view.destroy(); }
                catch (RuntimeException error) { Log.w(TAG, "Detached WebView cleanup failed", error); }
            }
            return true;
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (!"app.local".equals(uri.getHost())) return null;
            String path = uri.getPath();
            if (path == null || path.equals("/")) path = "/index.html";
            path = path.substring(1);
            if (path.contains("..")) return response(403, "text/plain", new ByteArrayInputStream("Forbidden".getBytes()));
            try {
                InputStream stream = getAssets().open(path);
                return response(200, mimeType(path), stream);
            } catch (IOException error) {
                return response(404, "text/plain", new ByteArrayInputStream("Not found".getBytes()));
            }
        }

        private WebResourceResponse response(int status, String mime, InputStream stream) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                return new WebResourceResponse(mime, "UTF-8", status, status == 200 ? "OK" : "Error", java.util.Collections.singletonMap("Cache-Control", "no-cache"), stream);
            }
            return new WebResourceResponse(mime, "UTF-8", stream);
        }

        private String mimeType(String path) {
            if (path.endsWith(".webmanifest")) return "application/manifest+json";
            String extension = MimeTypeMap.getFileExtensionFromUrl(path);
            String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension);
            return mime == null ? "application/octet-stream" : mime;
        }
    }
}
