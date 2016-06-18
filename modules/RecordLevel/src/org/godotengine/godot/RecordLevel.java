package org.godotengine.godot; // for 2.0

import android.app.Activity;
import com.appodeal.ads.Appodeal;
import com.appodeal.ads.RewardedVideoCallbacks;
import com.appodeal.ads.BannerCallbacks;
import android.content.Intent;
import javax.microedition.khronos.opengles.GL10;
import android.widget.Toast;
import android.util.Log;

import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;

public class RecordLevel extends Godot.SingletonBase {
    private Activity mainActivity;
    private int _callbackScript = -1;
    private float _recordLevel = 0.0f;

    private static final int RECORDER_SAMPLERATE = 48000;
    private static final int RECORDER_CHANNELS = AudioFormat.CHANNEL_IN_MONO;
    private static final int RECORDER_AUDIO_ENCODING = AudioFormat.ENCODING_PCM_16BIT;
    private AudioRecord recorder = null;
    private Thread recordingThread = null;
    private boolean isRecording = false;

    static public Godot.SingletonBase initialize(Activity p_activity) {
        return new RecordLevel(p_activity);
    }

    public RecordLevel(Activity p_activity) {
        //register class name and functions to bind
        mainActivity = p_activity;

        registerClass("RecordLevel", new String[]{"getRecordLevel", "startCapture", "stopCapture"});


    }

    public float getRecordLevel() {
      return _recordLevel;
    }

    public void startCapture() {
      startRecording();
    }

    public void stopCapture() {
      stopRecording();
    }

    int BufferElements2Rec = 1024; // want to play 2048 (2K) since 2 bytes we use only 1024
    int BytesPerElement = 2; // 2 bytes in 16bit format

    private void startRecording() {

        recorder = new AudioRecord(MediaRecorder.AudioSource.MIC,
                RECORDER_SAMPLERATE, RECORDER_CHANNELS,
                RECORDER_AUDIO_ENCODING, BufferElements2Rec * BytesPerElement);

        recorder.startRecording();
        isRecording = true;
        recordingThread = new Thread(new Runnable() {
            public void run() {
                writeAudioDataToFile();
            }
        }, "AudioRecorder Thread");
        recordingThread.start();
    }

    private void writeAudioDataToFile() {
        // Write the output audio in byte

        short sData[] = new short[BufferElements2Rec];

        while (isRecording) {
            // gets the voice output from microphone to byte format

            recorder.read(sData, 0, BufferElements2Rec);
            short maxVal = 0;
            for (int i = 0; i < BufferElements2Rec; ++i) {
                if (sData[i] > maxVal) {
                    maxVal = sData[i];
                }
            }
            Log.i("vasa","sound peak = " + maxVal);
            float maxValFloat = (float) maxVal / 32000;
            reportRecordVolume(maxValFloat);
        }
    }

    private void stopRecording() {
        // stops the recording activity
        if (null != recorder) {
            isRecording = false;
            recorder.stop();
            recorder.release();
            recorder = null;
            recordingThread = null;
        }
    }

    public void reportRecordVolume(float vol) {
      _recordLevel = vol;
    }

    protected void onMainActivityResult(int requestCode, int resultCode, Intent data) {}

    protected void onMainPause() {}
    protected void onMainResume() {
      Appodeal.onResume(mainActivity, Appodeal.BANNER);
    }
    protected void onMainDestroy() {}

    protected void onGLDrawFrame(GL10 gl) {}
    protected void onGLSurfaceChanged(GL10 gl, int width, int height) {} // singletons will always miss first onGLSurfaceChanged call

}
