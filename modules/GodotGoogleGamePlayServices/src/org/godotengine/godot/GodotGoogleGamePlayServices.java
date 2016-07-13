package org.godotengine.godot;

import android.app.Activity;
//import android.support.v4.app.FragmentActivity;
import android.content.Intent;
import javax.microedition.khronos.opengles.GL10;

import android.app.AlertDialog;
import android.app.Dialog;
import android.content.Context;
import android.content.ActivityNotFoundException;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.Uri;
import android.app.DialogFragment;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.IntentSender;
import android.os.Bundle;
import android.util.Log;
import android.view.Menu;
import android.view.MenuItem;
import android.view.View;
import android.widget.Button;
import android.widget.Toast;

import com.google.android.gms.games.Games;
import com.google.android.gms.games.GamesActivityResultCodes;
import com.google.android.gms.games.leaderboard.Leaderboards.SubmitScoreResult;
import com.google.android.gms.common.api.ResultCallback;

import com.google.android.gms.common.api.GoogleApiClient;
import com.google.android.gms.common.api.GoogleApiClient.OnConnectionFailedListener;
import com.google.android.gms.common.api.GoogleApiClient.ConnectionCallbacks;

import com.google.android.gms.common.ConnectionResult;
import com.google.android.gms.common.ErrorDialogFragment;
import com.google.android.gms.common.GoogleApiAvailability;
import com.google.android.gms.common.GooglePlayServicesUtil;

public class GodotGoogleGamePlayServices extends Godot.SingletonBase implements ConnectionCallbacks, OnConnectionFailedListener {
	enum ConnectReason {showLeaderboard, submitScore, submitScoreAndShowLeaderboard}

	Activity mainActivity;


	static GodotGoogleGamePlayServices _instance = null;
	public static GodotGoogleGamePlayServices getInstance() {return _instance;}

	protected ConnectReason _connectReason;
	protected int _lockScriptId = -1;
	protected int _submittingScoreAmount;
  protected boolean _submittingScoreSilentness;

	public void showLeaderboard() {
		showMeSomeLeaderboard();
		//		Log.i("123", p_str + " - v1");
		//		return 1;
	}
	public void submitScore(int score) {
		_submittingScoreAmount  = score;
		_submittingScoreSilentness = false;
		sendScore (score, false);
	}

	public void submitScoreSilently(int score) {
		_submittingScoreAmount = score;
		_submittingScoreSilentness = true;
		sendScore(score, true);
	}

	public void submitScoreAndShowLeaderboard(int score, int lockScriptId) {
		_lockScriptId = lockScriptId;
		_submittingScoreAmount = score;
		sendScoreAndShowLeaderboard((long)score);
		mainActivity.runOnUiThread(new Runnable() {
			public void run() {
				Toast.makeText(mainActivity, "trying to connect...", Toast.LENGTH_LONG).show();
			}
		});
	}

	public void submitScoreAndShowLeaderboard(int score) {
		submitScoreAndShowLeaderboard(score, -1);
	}

	public void shareSomeContent(String subj, String content) {
		Intent intent = new Intent(android.content.Intent.ACTION_SEND);
		intent.setType("text/plain");
		intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_WHEN_TASK_RESET);

		// Add data to the intent, the receiving app will decide what to do with it.
		intent.putExtra(Intent.EXTRA_SUBJECT, subj);
		intent.putExtra(Intent.EXTRA_TEXT, content);
		mainActivity.startActivity(Intent.createChooser(intent, "How do you want to share?"));
	}

	public String getPackageId() {
		return mainActivity.getPackageName();
	}

	public void rateAppInMarket() {
		Log.i("", "godot: rating");
		Uri uri = Uri.parse("market://details?id=" + mainActivity.getPackageName());
    Intent myAppLinkToMarket = new Intent(Intent.ACTION_VIEW, uri);
    try {
        mainActivity.startActivity(myAppLinkToMarket);
    } catch (ActivityNotFoundException e) {
        Toast.makeText(mainActivity, " unable to find market app", Toast.LENGTH_LONG).show();
    }
	}

	static public Godot.SingletonBase initialize(Activity p_activity) {
		_instance = new GodotGoogleGamePlayServices(p_activity);
		return _instance;
	}
	public GodotGoogleGamePlayServices(Activity p_activity) {
		registerClass("GodotGoogleGamePlayServices", new String[]{
			"showLeaderboard",
			"submitScore",
			"submitScoreAndShowLeaderboard",
			"submitScoreSilently",
			"shareSomeContent",
			"rateAppInMarket",
			"getPackageId",
			"submitImmediate"
		});
		mainActivity = p_activity;
		p_activity.runOnUiThread(new Runnable() {
			public void run() {
				String key = GodotLib.getGlobal("plugin/leaderboards_key");
				System.out.println(key);
			}
		});
	}
	// forwarded callbacks you can reimplement, as SDKs often need them

	//protected void onMainActivityResult(int requestCode, int resultCode, Intent data) {} // implemented later

	protected void onMainPause() {

	}
	protected void onMainResume() {

	}
	protected void onMainDestroy() {
		if (mGoogleApiClient != null)
		mGoogleApiClient.disconnect();

	}

	protected void onGLDrawFrame(GL10 gl) {

	}
	protected void onGLSurfaceChanged(GL10 gl, int width, int height) {

	} // singletons will always miss first onGLSurfaceChanged call

	/////////////////////////////////////// start copypaste

	private GoogleApiClient mGoogleApiClient;

	// Request code to use when launching the resolution activity
	private static final int REQUEST_RESOLVE_ERROR = 1001;
	// Unique tag for the error dialog fragment
	private static final String DIALOG_ERROR = "dialog_error";
	// Bool to track whether the app is already resolving an error
	private boolean mResolvingError = false;

	private static final String STATE_RESOLVING_ERROR = "resolving_error";

	private static final String LEADERBOARD_ID = "CgkIr6eIqOAMEAIQAQ"; // since we
	// cannot yet modify manifest on export process, where app_id is stored, no reason to store this in engine.cfg
	private static final int REQUEST_LEADERBOARD = 1002;

	// 				/*
	// 				@Override
	// 				protected void onSaveInstanceState(Bundle outState) {
	// 				super.onSaveInstanceState(outState);
	// 				outState.putBoolean(STATE_RESOLVING_ERROR, mResolvingError);
	// 			}
	//
	// 			@Override
	// 			protected void onCreate(Bundle savedInstanceState) {
	// 			super.onCreate(savedInstanceState);
	// 			setContentView(R.layout.activity_main);
	//
	// 			mResolvingError = savedInstanceState != null
	// 			&& savedInstanceState.getBoolean(STATE_RESOLVING_ERROR, false);
	//
	//
	//
	// 		}*/
	// 		/*
	// 		@Override
	// 		public boolean onCreateOptionsMenu(Menu menu) {
	// 		// Inflate the menu; this adds items to the action bar if it is present.
	// 		getMenuInflater().inflate(R.menu.menu_main, menu);
	// 		return true;
	// 	}
	//
	// 	@Override
	// 	public boolean onOptionsItemSelected(MenuItem item) {
	// 	// Handle action bar item clicks here. The action bar will
	// 	// automatically handle clicks on the Home/Up button, so long
	// 	// as you specify a parent activity in AndroidManifest.xml.
	// 	int id = item.getItemId();
	//
	// 	//noinspection SimplifiableIfStatement
	// 	if (id == R.id.action_settings) {
	// 	return true;
	// }
	//
	// return super.onOptionsItemSelected(item);
	// }
	//
	// @Override
	// protected void onResume() {
	// super.onResume();
	// System.out.println("I AM RESUME!");
	// }
	// */
	@Override
	public void onConnected(Bundle bundle) {
		System.out.println("godot connection is totaly ok");
		if (_connectReason == ConnectReason.showLeaderboard)
			requestShowLeaderboard();
		else if (_connectReason == ConnectReason.submitScore)
			sendScore(_submittingScoreAmount, _submittingScoreSilentness);
		else if (_connectReason == ConnectReason.submitScoreAndShowLeaderboard)
			sendScoreAndShowLeaderboard((long)_submittingScoreAmount);
	}

	@Override
	public void onConnectionSuspended(int i) {
		System.out.println("godot connection is suspend");
		Log.i("gus", null + " - hoho");

	}

	@Override
	public void onConnectionFailed(ConnectionResult result) {
		String reason = "";
		if (result.getErrorCode() == ConnectionResult.SERVICE_DISABLED) reason = "disabled";
		else if (result.getErrorCode() == ConnectionResult.SERVICE_VERSION_UPDATE_REQUIRED) reason = "update_required";
		else if (result.getErrorCode() == ConnectionResult.SERVICE_MISSING) reason = "missing";
		else reason = "unknown";
		System.out.println("godot connection failed, and reason is " + reason + " - " + result.getErrorCode());

		if (mResolvingError) {
			// Already attempting to resolve an error.
			return;
		} else if (result.hasResolution()) {
			try {
				mResolvingError = true;
				result.startResolutionForResult(mainActivity, REQUEST_RESOLVE_ERROR);
			} catch (IntentSender.SendIntentException e) {
				// There was an error with the resolution intent. Try again.
				mGoogleApiClient.connect();
			}
		} else {
			// Show dialog using GoogleApiAvailability.getErrorDialog()
			showErrorDialog(result.getErrorCode());
			mResolvingError = true;
			Log.i("godot", "ABABABAGA godot cannot connect and cannot resolve");
		}
	}

	/* Creates a dialog for an error message */
	private void showErrorDialog(int errorCode) {
		// Create a fragment for the error dialog
		ErrorDialogFragment dialogFragment = new ErrorDialogFragment();
		// Pass the error that should be displayed
		Bundle args = new Bundle();
		args.putInt(DIALOG_ERROR, errorCode);
		dialogFragment.setArguments(args);
		dialogFragment.show(mainActivity.getFragmentManager(), "errordialog");
	}

	/* A fragment to display an error dialog */
	public static class ErrorDialogFragment extends DialogFragment {
		public ErrorDialogFragment() { }

		@Override
		public Dialog onCreateDialog(Bundle savedInstanceState) {
			// Get the error code and retrieve the appropriate dialog
			int errorCode = this.getArguments().getInt(DIALOG_ERROR);
			return GoogleApiAvailability.getInstance().getErrorDialog(
			this.getActivity(), errorCode, REQUEST_RESOLVE_ERROR);
		}

		@Override
		public void onDismiss(DialogInterface dialog) {
			((GodotGoogleGamePlayServices) GodotGoogleGamePlayServices.getInstance()).onDialogDismissed();
		}
	}

	/* Called from ErrorDialogFragment when the dialog is dismissed. */
	public void onDialogDismissed() {
		mResolvingError = false;
	}



	protected void onMainActivityResult(int requestCode, int resultCode, Intent data) {
		if (requestCode == REQUEST_RESOLVE_ERROR) {
			mResolvingError = false;
			Log.i("12", "godot GOT ON MAINActivityResult = " + resultCode);

			if (resultCode == Activity.RESULT_OK) {
				// Make sure the app is not already connected or attempting to connect
				if (!mGoogleApiClient.isConnecting() &&
				!mGoogleApiClient.isConnected()) {
					mGoogleApiClient.connect();
				}
			}
			else {
				setGameLocked(false);
				if (resultCode == GamesActivityResultCodes.RESULT_SIGN_IN_FAILED)
					Toast.makeText(mainActivity, "unable to sign in, check Internet connection", Toast.LENGTH_LONG).show();
			}
			return;
			// 		/*else {
			// 		String text = "";
			// 		if (!isNetworkConnected())
			// 		text = "No internet connection, please try later";
			// 		else
			// 		text = "Some error occurred";
			// 		new AlertDialog.Builder(mainActivity)
			// 		.setTitle("Error")
			// 		.setMessage(text)
			// 		.setNeutralButton(android.R.string.ok, new DialogInterface.OnClickListener() {
			// 		public void onClick(DialogInterface dialog, int which) {
			// 		// do nothing
			// 	}
			// })
			// .setIcon(android.R.drawable.ic_dialog_alert)
			// .show();            }*/
		}
	}


	/*@Override
	protected void onStop() {
	if (mGoogleApiClient != null)
	mGoogleApiClient.disconnect();
	super.onStop();
}*/

protected GoogleApiClient getClient() {
	if (mGoogleApiClient == null) {
		Log.i("123","godot creating api client");
		mGoogleApiClient = new GoogleApiClient.Builder(mainActivity)
		.addApi(Games.API)
		.addScope(Games.SCOPE_GAMES)
		.addConnectionCallbacks(this)
		.addOnConnectionFailedListener(this)
		.build();
	}
	return mGoogleApiClient;
}

protected void tryToConnect(ConnectReason reason) {
	GoogleApiClient client = getClient();
	if (client != null && !client.isConnecting() && !client.isConnected() && !mResolvingError) {
		Log.i("123","godot trying to connect");
		mGoogleApiClient.connect();

	}
	_connectReason = reason;
}
public void showMeSomeLeaderboard() {
	GoogleApiClient client = getClient();
	tryToConnect(ConnectReason.showLeaderboard);

	if (client.isConnected()) {
		Log.i("123","godot api client is connected, request leaderboard");
		requestShowLeaderboard();
	}
}

private void requestShowLeaderboard() {
	setGameLocked(false);
	mainActivity.startActivityForResult(Games.Leaderboards.getLeaderboardIntent(mGoogleApiClient,
	LEADERBOARD_ID), REQUEST_LEADERBOARD);
}

private boolean isNetworkConnected() {
	ConnectivityManager cm = (ConnectivityManager) mainActivity.getSystemService(Context.CONNECTIVITY_SERVICE);
	NetworkInfo ni = cm.getActiveNetworkInfo();
	if (ni == null) {
		// There are no active networks.
		return false;
	} else
	return true;
}

public void sendScore (int score, boolean silent) {
	GoogleApiClient client  = getClient();
	if (score < 0 || silent && !client.isConnected()) return;
	tryToConnect(ConnectReason.submitScore);
	if (client.isConnected()) {
		Log.i("123"," godot api client is connected, request submitScore");
		Games.Leaderboards.submitScore(client, LEADERBOARD_ID, score);
	}
}

class myLeaderBoardSubmitScoreCallback implements ResultCallback<SubmitScoreResult> {
	@Override
	public void onResult(SubmitScoreResult res) {
		Log.i("godot"," submit score callback, code = " + res.getStatus().getStatusCode());

		if (res.getStatus().getStatusCode() == 0) {
			requestShowLeaderboard();
		}
		else {
			Toast.makeText(mainActivity, "cannot send score, error "+res.getStatus().getStatusCode(), Toast.LENGTH_LONG).show();
		}
	}
}

public void submitImmediate() {
	Log.i("godot","submit immediate score 5");
	Games.Leaderboards.submitScoreImmediate(getClient(), LEADERBOARD_ID, 5).
		setResultCallback(new myLeaderBoardSubmitScoreCallback());
}


public void sendScoreAndShowLeaderboard (long score) {
	if (score < 0) return;
	tryToConnect(ConnectReason.submitScoreAndShowLeaderboard);
	GoogleApiClient client = getClient();
	if (client.isConnected()) {
		Log.i("godot","client conneected, submitting score = " + score);
		Games.Leaderboards.submitScoreImmediate(client, LEADERBOARD_ID, score).
			setResultCallback(new myLeaderBoardSubmitScoreCallback());
	}
	setGameLocked(true);
}

protected void setGameLocked (boolean value) {
	if (_lockScriptId != -1) {
		Log.i("godot"," godot goin to lock calldeferred");
	  GodotLib.calldeferred(_lockScriptId, "lock", new Object[]{value});
	}
	if (value == false) {
		_lockScriptId = -1;
	}
}
}
