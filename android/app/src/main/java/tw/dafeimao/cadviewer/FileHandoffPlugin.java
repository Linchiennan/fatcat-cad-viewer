package tw.dafeimao.cadviewer;

import android.content.*;
import android.net.Uri;
import android.os.Parcelable;
import android.util.Base64;
import androidx.core.content.FileProvider;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.*;
import java.util.UUID;

/**
 * Hands an output file (PNG / PDF) to other apps: the system share sheet or "open with". The file is written
 * under cache/shared/ (the only folder the FileProvider exposes) and passed with a temporary read grant; no
 * permission is needed. This app itself is left out of both lists. Web side: src/native/fileHandoff.ts.
 */
@CapacitorPlugin(name = "FileHandoff")
public class FileHandoffPlugin extends Plugin {

    private static final int MAX_BYTES = 64 * 1024 * 1024;
    private static final long KEEP_MILLIS = 24L * 60 * 60 * 1000;

    @PluginMethod
    public void share(PluginCall call) {
        handOff(call, false);
    }

    @PluginMethod
    public void open(PluginCall call) {
        handOff(call, true);
    }

    /**
     * Several files in one share sheet (工程相機匯出「不包 ZIP」, 用戶 2026-11-22): files = [{ data, fileName, mimeType }],
     * all written into one cache/shared/<random>/ folder and sent with ACTION_SEND_MULTIPLE.
     */
    @PluginMethod
    public void shareMany(PluginCall call) {
        JSArray files = call.getArray("files");
        if (files == null || files.length() == 0) {
            call.reject("No files", "HANDOFF_FAILED");
            return;
        }
        execute(() -> {
            java.util.ArrayList<Uri> uris = new java.util.ArrayList<>();
            try {
                File root = new File(getContext().getCacheDir(), "shared");
                prune(root);
                File dir = new File(root, UUID.randomUUID().toString());
                if (!dir.mkdirs()) throw new IllegalStateException("mkdirs");
                long total = 0;
                for (int i = 0; i < files.length(); i++) {
                    org.json.JSONObject f = files.getJSONObject(i);
                    byte[] bytes = Base64.decode(f.getString("data"), Base64.DEFAULT);
                    total += bytes.length;
                    if (total > MAX_BYTES) {
                        call.reject("Files too large to hand over", "HANDOFF_TOO_LARGE");
                        return;
                    }
                    File file = new File(dir, f.optString("fileName", "output-" + i).replaceAll("[\\\\/]", "_"));
                    try (FileOutputStream out = new FileOutputStream(file)) {
                        out.write(bytes);
                    }
                    uris.add(FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file));
                }
            } catch (Exception e) {
                call.reject("Could not prepare the files", "HANDOFF_FAILED");
                return;
            }
            getBridge().executeOnMainThread(() -> {
                Intent target = new Intent(Intent.ACTION_SEND_MULTIPLE).setType("*/*");
                target.putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris);
                ClipData clip = ClipData.newRawUri("", uris.get(0));
                for (int i = 1; i < uris.size(); i++) clip.addItem(new ClipData.Item(uris.get(i)));
                target.setClipData(clip);
                target.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                Intent chooser = Intent.createChooser(target, null);
                chooser.putExtra(Intent.EXTRA_EXCLUDE_COMPONENTS, new Parcelable[] { new ComponentName(getContext(), MainActivity.class) });
                chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                try {
                    getActivity().startActivity(chooser);
                    call.resolve();
                } catch (ActivityNotFoundException e) {
                    call.reject("No app can take these files", "HANDOFF_NO_APP");
                }
            });
        });
    }

    private void handOff(PluginCall call, boolean view) {
        String data = call.getString("data");
        String mime = call.getString("mimeType", "application/octet-stream");
        String name = call.getString("fileName", "output");
        if (data == null || data.length() > MAX_BYTES / 3 * 4 + 4) {
            call.reject("File too large to hand over", "HANDOFF_TOO_LARGE");
            return;
        }
        execute(() -> {
            Uri uri;
            try {
                uri = write(Base64.decode(data, Base64.DEFAULT), name);
            } catch (Exception e) {
                call.reject("Could not prepare the file", "HANDOFF_FAILED");
                return;
            }
            getBridge().executeOnMainThread(() -> launch(call, uri, mime, view));
        });
    }

    /** cache/shared/<random>/<name>: a folder per hand-over keeps the original file name. Old ones are removed. */
    private Uri write(byte[] bytes, String name) throws Exception {
        File root = new File(getContext().getCacheDir(), "shared");
        prune(root);
        File dir = new File(root, UUID.randomUUID().toString());
        if (!dir.mkdirs()) throw new IllegalStateException("mkdirs");
        File file = new File(dir, name.replaceAll("[\\\\/]", "_"));
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(bytes);
        }
        return FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
    }

    private static void prune(File root) {
        File[] old = root.listFiles();
        if (old == null) return;
        long cutoff = System.currentTimeMillis() - KEEP_MILLIS;
        for (File dir : old) {
            if (dir.lastModified() >= cutoff) continue;
            File[] files = dir.listFiles();
            if (files != null) for (File f : files) f.delete();
            dir.delete();
        }
    }

    private void launch(PluginCall call, Uri uri, String mime, boolean view) {
        Intent target;
        if (view) {
            target = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, mime);
        } else {
            target = new Intent(Intent.ACTION_SEND).setType(mime).putExtra(Intent.EXTRA_STREAM, uri);
            target.setClipData(ClipData.newRawUri("", uri));
        }
        target.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        // Always through the chooser so this app (which also accepts PNG / PDF) can be excluded.
        Intent chooser = Intent.createChooser(target, null);
        chooser.putExtra(Intent.EXTRA_EXCLUDE_COMPONENTS, new Parcelable[] { new ComponentName(getContext(), MainActivity.class) });
        chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            getActivity().startActivity(chooser);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("No app can open this file", "HANDOFF_NO_APP");
        }
    }
}
