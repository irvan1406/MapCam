package id.irvan.gpsmapcamera;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.content.UriMatcher;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import android.webkit.MimeTypeMap;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;

public final class ShareFileProvider extends ContentProvider {
    public static Uri uriForFile(Context context, File file) throws IOException {
        File cache = context.getCacheDir().getCanonicalFile();
        File target = file.getCanonicalFile();
        if (!target.getPath().startsWith(cache.getPath() + File.separator)) throw new SecurityException("File must be inside app cache.");
        String relative = target.getPath().substring(cache.getPath().length() + 1);
        return new Uri.Builder().scheme("content").authority(context.getPackageName() + ".files").appendPath("cache").appendPath(relative).build();
    }

    @Override public boolean onCreate() { return true; }

    @Override
    public String getType(Uri uri) {
        String extension = MimeTypeMap.getFileExtensionFromUrl(uri.toString());
        String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension);
        return mime == null ? "application/octet-stream" : mime;
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        File file = resolve(uri);
        int flags = mode.contains("w")
                ? ParcelFileDescriptor.MODE_CREATE | ParcelFileDescriptor.MODE_TRUNCATE | ParcelFileDescriptor.MODE_WRITE_ONLY
                : ParcelFileDescriptor.MODE_READ_ONLY;
        return ParcelFileDescriptor.open(file, flags);
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        File file = resolve(uri);
        String[] columns = projection == null ? new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE} : projection;
        MatrixCursor cursor = new MatrixCursor(columns, 1);
        Object[] values = new Object[columns.length];
        for (int index = 0; index < columns.length; index++) {
            if (OpenableColumns.DISPLAY_NAME.equals(columns[index])) values[index] = file.getName();
            else if (OpenableColumns.SIZE.equals(columns[index])) values[index] = file.length();
        }
        cursor.addRow(values);
        return cursor;
    }

    private File resolve(Uri uri) {
        if (!"cache".equals(uri.getPathSegments().isEmpty() ? "" : uri.getPathSegments().get(0))) throw new SecurityException("Unknown path.");
        String encoded = uri.getEncodedPath();
        String relative = encoded.substring("/cache/".length());
        File file = new File(getContext().getCacheDir(), Uri.decode(relative));
        try {
            File canonicalCache = getContext().getCacheDir().getCanonicalFile();
            File canonicalFile = file.getCanonicalFile();
            if (!canonicalFile.getPath().startsWith(canonicalCache.getPath() + File.separator)) throw new SecurityException("Path traversal blocked.");
            return canonicalFile;
        } catch (IOException error) {
            throw new IllegalArgumentException("Invalid file path.", error);
        }
    }

    @Override public int delete(Uri uri, String selection, String[] selectionArgs) { return resolve(uri).delete() ? 1 : 0; }
    @Override public Uri insert(Uri uri, ContentValues values) { throw new UnsupportedOperationException(); }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) { throw new UnsupportedOperationException(); }
}
