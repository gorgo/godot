package org.godotengine.godot; // for 2.0

import android.app.Activity;
import com.appodeal.ads.Appodeal;
import com.appodeal.ads.RewardedVideoCallbacks;
import com.appodeal.ads.BannerCallbacks;
import android.content.Intent;
import javax.microedition.khronos.opengles.GL10;
import android.widget.Toast;
import android.util.Log;

public class AppodealGodot extends Godot.SingletonBase {
    private Activity mainActivity;
    private int _callbackScript = -1;
    private Toast mToast;
    private boolean _isBannerCancelled = false;

    public void showBanner() {
      _isBannerCancelled = false;
      //if (Appodeal.isLoaded(Appodeal.BANNER_TOP))
        Appodeal.show(mainActivity, Appodeal.BANNER_TOP);
        if (! Appodeal.isLoaded(Appodeal.BANNER_TOP))
          Appodeal.cache(mainActivity, Appodeal.BANNER_TOP);
      // else {
      //   Log.i("", "Appodeal: start cache");
      //   mainActivity.runOnUiThread(new Runnable() {
      //           public void run() {
      //             Appodeal.cache(mainActivity, Appodeal.BANNER_TOP);
      //           }
      //         }
      //         );
      //   Log.i("", "Appodeal: end cache (sync)");
      //
      // }
    }

    public void cacheBannner() {
      Appodeal.cache(mainActivity, Appodeal.BANNER_TOP);
    }

    public void hideBanner() {
      Appodeal.hide(mainActivity, Appodeal.BANNER_TOP);
      _isBannerCancelled = true;
    }

    public void showRewarded(int callbackScript) {
      _callbackScript = callbackScript;
      mainActivity.runOnUiThread(new Runnable() {
              public void run() {
                  //useful way to get config info from engine.cfg
                  showToast("Loading video...", Toast.LENGTH_LONG);
              }
      });
      Appodeal.cache(mainActivity, Appodeal.REWARDED_VIDEO);
    }

    static public Godot.SingletonBase initialize(Activity p_activity) {
        return new AppodealGodot(p_activity);
    }

    public AppodealGodot(Activity p_activity) {
        //register class name and functions to bind
        mainActivity = p_activity;

        registerClass("AppodealGodot", new String[]{"showBanner", "hideBanner", "cacheBanner", "showRewarded"});


        Appodeal.disableLocationPermissionCheck();
        Appodeal.setAutoCache(Appodeal.REWARDED_VIDEO, false);
        Appodeal.setAutoCache(Appodeal.BANNER_TOP, false);

        Appodeal.setRewardedVideoCallbacks(new RewardedVideoCallbacks() {
            @Override
            public void onRewardedVideoLoaded() {
              Appodeal.show(mainActivity, Appodeal.REWARDED_VIDEO);
            }
            @Override
            public void onRewardedVideoFailedToLoad() {
              showToast("Failed to load, check Internet connection");
              if (_callbackScript >= 0)
                GodotLib.calldeferred(_callbackScript, "rewardedVideoFailedToLoad", new Object[]{});
            }
            @Override
            public void onRewardedVideoShown() {
              //showToast("onRewardedVideoShown");
            }
            @Override
            public void onRewardedVideoFinished(int amount, String name) {
              //showToast(String.format("onRewardedVideoFinished. Reward: %d %s", amount, name));
              if (_callbackScript >= 0)
                GodotLib.calldeferred(_callbackScript, "rewardedVideoFinished", new Object[]{});
            }
            @Override
            public void onRewardedVideoClosed(boolean finished) {
              //showToast("onRewardedVideoClosed");
            }

        });
        // Appodeal.setBannerCallbacks(new BannerCallbacks() {
        //   @Override
        //   public void onBannerLoaded() {
        //     if (! _isBannerCancelled)
        //       Appodeal.show(mainActivity, Appodeal.BANNER_TOP);
        //   }
        //   @Override
        //   public void onBannerFailedToLoad() {}
        //
        //   @Override
        //   public void onBannerShown() {}
        //
        //   @Override
        //   public void onBannerClicked() {}
        //
        // });
        // you might want to try initializing your singleton here, but android
        // threads are weird and this runs in another thread, so you usually have to do
        p_activity.runOnUiThread(new Runnable() {
                public void run() {
                    //useful way to get config info from engine.cfg
                    String appKey = GodotLib.getGlobal("appodeal/appKey");
                    Appodeal.initialize(mainActivity, appKey, Appodeal.BANNER_TOP | Appodeal.REWARDED_VIDEO);

                }
        });

    }

    void showToast(final String text) {
      showToast(text, Toast.LENGTH_SHORT);
    }

    void showToast(final String text, int duration) {
      if (mToast == null) {
        mToast = Toast.makeText(mainActivity, text, Toast.LENGTH_SHORT);
      }
      mToast.setText(text);
      mToast.setDuration(Toast.LENGTH_SHORT);
      mToast.show();
    }
    // forwarded callbacks you can reimplement, as SDKs often need them

    protected void onMainActivityResult(int requestCode, int resultCode, Intent data) {}

    protected void onMainPause() {}
    protected void onMainResume() {
      Appodeal.onResume(mainActivity, Appodeal.BANNER_TOP);
    }
    protected void onMainDestroy() {}

    protected void onGLDrawFrame(GL10 gl) {}
    protected void onGLSurfaceChanged(GL10 gl, int width, int height) {} // singletons will always miss first onGLSurfaceChanged call

}
