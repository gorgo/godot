package org.godotengine.godot; // for 2.0

import android.app.Activity;
import android.content.Intent;
import javax.microedition.khronos.opengles.GL10;
import android.widget.Toast;
import com.google.android.gms.analytics.GoogleAnalytics;
import com.google.android.gms.analytics.Tracker;
import com.google.android.gms.analytics.HitBuilders;
import android.util.Log;

public class GAGodot extends Godot.SingletonBase {
    private Activity mainActivity;
    private int _callbackScript = -1;

    public static GoogleAnalytics analytics;
    public static Tracker tracker;

    public void sendParameter(int id, float value) {
      tracker.send(new HitBuilders.ScreenViewBuilder()
            .setCustomMetric(id, value)
            .build()
        );
    }

    public void sendScreen(String name) {
      tracker.setScreenName(name);
      // Send a screen view.
      tracker.send(new HitBuilders.ScreenViewBuilder().build());
      Log.i("godot", "godot: send screen " + name);
    }

    public void sendEvent(String name) {
      tracker.send(new HitBuilders.EventBuilder()
        .setAction(name)
        .build());
    }

    static public Godot.SingletonBase initialize(Activity p_activity) {
        return new GAGodot(p_activity);
    }

    public GAGodot(Activity p_activity) {
        //register class name and functions to bind
        mainActivity = p_activity;

        registerClass("GAGodot", new String[]{"sendParameter", "sendScreen", "sendEvent"});

        String ua = GodotLib.getGlobal("google_analytics/ua");

        analytics = GoogleAnalytics.getInstance(mainActivity);
        analytics.setLocalDispatchPeriod(1800);

        tracker = analytics.newTracker(ua);
        tracker.enableExceptionReporting(true);
        tracker.setAnonymizeIp(true);

        p_activity.runOnUiThread(new Runnable() {
                public void run() {
                    //useful way to get config info from engine.cfg

                }
        });

    }

    // forwarded callbacks you can reimplement, as SDKs often need them

    protected void onMainActivityResult(int requestCode, int resultCode, Intent data) {}

    protected void onMainPause() {}
    protected void onMainResume() {
    }
    protected void onMainDestroy() {}

    protected void onGLDrawFrame(GL10 gl) {}
    protected void onGLSurfaceChanged(GL10 gl, int width, int height) {} // singletons will always miss first onGLSurfaceChanged call

}
