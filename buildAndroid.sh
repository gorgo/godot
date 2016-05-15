set -x
rm -fr templates/*
#debug
if [ -z "$1" ]
then
	scons platform=android target=release_debug -j 7
	rm -rf platform/android/java/libs/armeabi
	mkdir platform/android/java/libs/armeabi
	cp bin/libgodot.android.opt.debug.armv7.neon.so platform/android/java/libs/armeabi/libgodot_android.so
fi
cd platform/android/java
rm build/outputs/apk/*
./gradlew build
cd ../../..
cp platform/android/java/build/outputs/apk/java-debug.apk templates/godot_debug.apk

#release
if [ -z "$1" ]
then
	scons platform=android target=release -j 7
	rm -rf platform/android/java/libs/armeabi
	mkdir platform/android/java/libs/armeabi
	cp bin/libgodot.android.opt.armv7.neon.so platform/android/java/libs/armeabi/libgodot_android.so
fi
cd platform/android/java
rm build/outputs/apk/*
./gradlew build
cd ../../..
cp platform/android/java/build/outputs/apk/java-release-unsigned.apk templates/godot_release.apk

