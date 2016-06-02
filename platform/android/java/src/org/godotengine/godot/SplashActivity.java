package org.godotengine.godot;

import android.content.Intent;
import android.os.Bundle;
import android.app.Activity;
//import com.godot.game.R;

// import android.widget.Button;
// import android.view.View;
// import android.view.View.OnClickListener;

import com.appodeal.ads.Appodeal;

public class SplashActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        //setContentView(R.layout.main);
        Intent intent = new Intent(this, org.godotengine.godot.Godot.class);
        startActivity(intent);
        finish();

    }


}
