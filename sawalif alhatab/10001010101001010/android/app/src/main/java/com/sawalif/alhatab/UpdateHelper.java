package com.sawalif.alhatab;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class UpdateHelper {

    // ⬅️ غيّر هذا الرابط إلى رابط موقعك المنشور (السيرفر)
    public static final String BASE_URL = "https://sawalif-alhatab.onrender.com";
    private static final String UPDATE_ENDPOINT = "/api/android-update";
    private static final String APK_ENDPOINT = "/api/android-apk";
    private static final String APK_NAME = "app-release.apk";

    private final Context context;
    private long downloadId = -1;
    private BroadcastReceiver receiver;

    public UpdateHelper(Context context) {
        this.context = context;
    }

    public void checkForUpdate() {
        checkForUpdate(false);
    }

    public void checkForUpdateAuto() {
        checkForUpdate(true);
    }

    private void checkForUpdate(boolean silent) {
        new Thread(() -> {
            try {
                URL url = new URL(BASE_URL + UPDATE_ENDPOINT);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setConnectTimeout(10000);
                conn.setReadTimeout(10000);
                InputStream in = new BufferedInputStream(conn.getInputStream());
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[1024];
                int n;
                while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
                in.close();
                JSONObject json = new JSONObject(out.toString());
                int latest = json.optInt("versionCode", 0);
                int current = getCurrentVersionCode();
                if (latest > current) {
                    showToast("يوجد تحديث جديد (بناء " + latest + ") — جار التحميل...");
                    downloadApk();
                } else if (!silent) {
                    showToast("أنت تستخدم أحدث إصدار ✓");
                }
            } catch (Exception e) {
                if (!silent) showToast("تعذر التحقق من التحديث");
            }
        }).start();
    }

    private int getCurrentVersionCode() {
        try {
            return context.getPackageManager().getPackageInfo(context.getPackageName(), 0).versionCode;
        } catch (PackageManager.NameNotFoundException e) {
            return 0;
        }
    }

    private void downloadApk() {
        String url = BASE_URL + APK_ENDPOINT;
        DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
        request.setTitle("تحديث سوالف على الحطب");
        request.setDescription("جار تحميل التحديث...");
        request.setMimeType("application/vnd.android.package-archive");
        request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
        request.setDestinationInExternalFilesDir(context, Environment.DIRECTORY_DOWNLOADS, APK_NAME);
        DownloadManager dm = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
        downloadId = dm.enqueue(request);

        IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context c, Intent i) {
                long id = i.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                if (id == downloadId) {
                    try { context.unregisterReceiver(this); } catch (Exception ignored) {}
                    installApk();
                }
            }
        };
        context.registerReceiver(receiver, filter);
    }

    private void installApk() {
        File file = new File(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), APK_NAME);
        if (!file.exists()) { showToast("تعذر العثور على ملف التحديث"); return; }
        Uri uri;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            uri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", file);
        } else {
            uri = Uri.fromFile(file);
        }
        Intent intent = new Intent(Intent.ACTION_INSTALL_PACKAGE);
        intent.setData(uri);
        intent.setFlags(Intent.FLAG_GRANT_READ_URI_PERMISSIONS | Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);
    }

    private void showToast(String msg) {
        if (context instanceof android.app.Activity) {
            ((android.app.Activity) context).runOnUiThread(() ->
                Toast.makeText(context, msg, Toast.LENGTH_LONG).show());
        } else {
            Toast.makeText(context, msg, Toast.LENGTH_LONG).show();
        }
    }
}
