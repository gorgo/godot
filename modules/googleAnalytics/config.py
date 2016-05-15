def can_build(plat):
    return plat == 'android'

def configure(env):
    if env['platform'] == 'android':
#        env.android_module_file("GodotGoogleGamePlayServices.java")
        env.android_add_java_dir("src")
        #env.android_add_res_dir("res")
        env.android_add_dependency("compile 'com.google.android.gms:play-services-analytics:8.4.0'")
        env.android_add_to_permissions("ManifestPermissionsChunk.xml")
