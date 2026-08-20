package id.irvan.gpsmapcamera;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import android.webkit.WebView;

final class StartupRecoveryView {
    private static final int COLOR_BACKGROUND = Color.rgb(244, 248, 252);
    private static final int COLOR_PRIMARY = Color.rgb(22, 101, 216);
    private static final int COLOR_TEXT = Color.rgb(15, 31, 50);
    private static final int COLOR_MUTED = Color.rgb(83, 101, 122);
    private static final int COLOR_SURFACE = Color.WHITE;

    private StartupRecoveryView() {}

    static View create(Activity activity, Throwable error, Runnable retry) {
        String diagnostics = buildDiagnostics(error);

        ScrollView scroll = new ScrollView(activity);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(COLOR_BACKGROUND);

        LinearLayout content = new LinearLayout(activity);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setGravity(Gravity.CENTER_HORIZONTAL);
        content.setPadding(dp(activity, 24), dp(activity, 48), dp(activity, 24), dp(activity, 32));
        scroll.addView(content, new ScrollView.LayoutParams(
                ScrollView.LayoutParams.MATCH_PARENT,
                ScrollView.LayoutParams.WRAP_CONTENT
        ));

        TextView badge = new TextView(activity);
        badge.setText("!");
        badge.setTextColor(Color.WHITE);
        badge.setTextSize(28);
        badge.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        badge.setGravity(Gravity.CENTER);
        badge.setBackground(rounded(activity, Color.rgb(224, 64, 77), 28, 0, 0));
        content.addView(badge, sized(activity, 56, 56, 0, 0, 0, 18));

        TextView title = text(activity, "Aplikasi belum dapat dibuka", 23, COLOR_TEXT, Typeface.BOLD);
        title.setGravity(Gravity.CENTER);
        content.addView(title, matchWidth(activity, 0, 0, 0, 8));

        TextView message = text(
                activity,
                "GPS Map Camera berhasil mencegah aplikasi tertutup. Tekan Coba Lagi. Jika error berkaitan dengan WebView, gunakan tombol pengaturan di bawah.",
                15,
                COLOR_MUTED,
                Typeface.NORMAL
        );
        message.setGravity(Gravity.CENTER);
        message.setLineSpacing(0, 1.15f);
        content.addView(message, matchWidth(activity, 0, 0, 0, 24));

        Button retryButton = button(activity, "Coba Lagi", true);
        retryButton.setOnClickListener(view -> retry.run());
        content.addView(retryButton, matchWidth(activity, 0, 0, 0, 10));

        Button updateButton = button(activity, "Atur / Perbarui WebView", false);
        updateButton.setOnClickListener(view -> openWebViewUpdate(activity));
        content.addView(updateButton, matchWidth(activity, 0, 0, 0, 10));

        Button copyButton = button(activity, "Salin Detail Error", false);
        copyButton.setOnClickListener(view -> copyDiagnostics(activity, diagnostics));
        content.addView(copyButton, matchWidth(activity, 0, 0, 0, 24));

        LinearLayout detailCard = new LinearLayout(activity);
        detailCard.setOrientation(LinearLayout.VERTICAL);
        detailCard.setPadding(dp(activity, 16), dp(activity, 14), dp(activity, 16), dp(activity, 14));
        detailCard.setBackground(rounded(activity, COLOR_SURFACE, 16, Color.rgb(218, 227, 237), 1));
        content.addView(detailCard, matchWidth(activity, 0, 0, 0, 0));

        TextView detailTitle = text(activity, "Detail diagnostik", 13, COLOR_TEXT, Typeface.BOLD);
        detailCard.addView(detailTitle, matchWidth(activity, 0, 0, 0, 7));

        TextView detail = text(activity, diagnostics, 12, COLOR_MUTED, Typeface.MONOSPACE.getStyle());
        detail.setTypeface(Typeface.MONOSPACE);
        detail.setTextIsSelectable(true);
        detail.setLineSpacing(0, 1.1f);
        detailCard.addView(detail, matchWidth(activity, 0, 0, 0, 0));

        return scroll;
    }

    private static String buildDiagnostics(Throwable error) {
        String provider = "tidak tersedia";
        try {
            PackageInfo info = WebView.getCurrentWebViewPackage();
            if (info != null) provider = info.packageName + " " + info.versionName;
        } catch (Throwable ignored) {
            provider = "gagal diperiksa";
        }

        String errorName = error == null ? "UnknownStartupError" : error.getClass().getSimpleName();
        String errorMessage = error == null || error.getMessage() == null ? "Tanpa pesan tambahan" : error.getMessage();
        return "Aplikasi: " + BuildConfig.VERSION_NAME + " (" + BuildConfig.VERSION_CODE + ")"
                + "\nAndroid: " + Build.VERSION.RELEASE + " / API " + Build.VERSION.SDK_INT
                + "\nPerangkat: " + Build.MANUFACTURER + " " + Build.MODEL
                + "\nWebView: " + provider
                + "\nError: " + errorName + ": " + errorMessage;
    }

    private static void copyDiagnostics(Activity activity, String diagnostics) {
        ClipboardManager clipboard = (ClipboardManager) activity.getSystemService(Context.CLIPBOARD_SERVICE);
        if (clipboard != null) {
            clipboard.setPrimaryClip(ClipData.newPlainText("GPS Map Camera startup error", diagnostics));
            Toast.makeText(activity, "Detail error berhasil disalin.", Toast.LENGTH_SHORT).show();
        }
    }

    private static void openWebViewUpdate(Activity activity) {
        Intent webViewSettings = new Intent(Settings.ACTION_WEBVIEW_SETTINGS);
        if (webViewSettings.resolveActivity(activity.getPackageManager()) != null) {
            activity.startActivity(webViewSettings);
            return;
        }

        Intent market = new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=com.google.android.webview"));
        if (market.resolveActivity(activity.getPackageManager()) != null) {
            activity.startActivity(market);
            return;
        }

        Intent browser = new Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=com.google.android.webview"));
        if (browser.resolveActivity(activity.getPackageManager()) != null) activity.startActivity(browser);
        else Toast.makeText(activity, "Buka Play Store lalu perbarui Android System WebView atau Google Chrome.", Toast.LENGTH_LONG).show();
    }

    private static TextView text(Activity activity, String value, int size, int color, int style) {
        TextView view = new TextView(activity);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(color);
        view.setTypeface(Typeface.DEFAULT, style);
        return view;
    }

    private static Button button(Activity activity, String value, boolean primary) {
        Button button = new Button(activity);
        button.setText(value);
        button.setTextSize(15);
        button.setAllCaps(false);
        button.setGravity(Gravity.CENTER);
        button.setMinHeight(dp(activity, 52));
        button.setTextColor(primary ? Color.WHITE : COLOR_PRIMARY);
        button.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        button.setBackground(rounded(activity, primary ? COLOR_PRIMARY : COLOR_SURFACE, 14, primary ? COLOR_PRIMARY : Color.rgb(199, 214, 231), 1));
        return button;
    }

    private static GradientDrawable rounded(Context context, int color, int radiusDp, int strokeColor, int strokeDp) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(dp(context, radiusDp));
        if (strokeDp > 0) drawable.setStroke(dp(context, strokeDp), strokeColor);
        return drawable;
    }

    private static LinearLayout.LayoutParams matchWidth(Context context, int left, int top, int right, int bottom) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        params.setMargins(dp(context, left), dp(context, top), dp(context, right), dp(context, bottom));
        return params;
    }

    private static LinearLayout.LayoutParams sized(Context context, int width, int height, int left, int top, int right, int bottom) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(dp(context, width), dp(context, height));
        params.setMargins(dp(context, left), dp(context, top), dp(context, right), dp(context, bottom));
        return params;
    }

    private static int dp(Context context, int value) {
        return Math.round(value * context.getResources().getDisplayMetrics().density);
    }
}
