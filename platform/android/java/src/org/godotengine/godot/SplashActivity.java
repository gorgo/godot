package org.godotengine.godot;

import android.content.Intent;
import android.os.Bundle;
import android.app.Activity;

public class SplashActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Intent intent = new Intent(this, org.godotengine.godot.Godot.class);
        startActivity(intent);
        finish();
    }
}
