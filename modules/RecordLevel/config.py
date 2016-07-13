def can_build(plat):
    return plat == 'android'

def configure(env):
    if env['platform'] == 'android':
#        env.android_module_file("GodotGoogleGamePlayServices.java")
        #env.android_add_to_manifest("AndroidManifestChunk.xml")
        env.android_add_java_dir("src")
        #env.android_add_res_dir("res")
        #jarpath = "../../../modules/appodeal/"
        #env.android_add_dependency("compile files('"+jarpath+"jar/android-support-v7-recyclerview-23.1.1.jar', '"+jarpath+"jar/applovin-6.1.5.jar', '"+jarpath+"jar/appodeal-1.14.12.jar', '"+jarpath+"jar/chartboost-6.4.1.jar', '"+jarpath+"jar/flurry-analytics-6.2.0.jar', '"+jarpath+"jar/inmobi-5.2.3.jar', '"+jarpath+"jar/my-target-4.3.10.jar', '"+jarpath+"jar/unity-ads-1.4.7.jar', '"+jarpath+"jar/yandex-metrica-2.32.jar')")
        #env.android_add_dependency("compile 'com.google.android.gms:play-services-ads:8.4.0'")
        env.android_add_to_permissions("ManifestPermissionsChunk.xml")
