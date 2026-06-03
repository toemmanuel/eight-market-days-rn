package com.marketdays

import android.os.Bundle
import android.content.Intent
import com.swmansion.rnscreens.fragment.restoration.RNScreensFragmentFactory
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.facebook.react.ReactInstanceManager

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "EightMarketDays"

  override fun onCreate(savedInstanceState: Bundle?) {
    supportFragmentManager.fragmentFactory = RNScreensFragmentFactory()
    super.onCreate(savedInstanceState)
    
    // Handle intent when app is opened from notification
    handleIntent(intent)
  }

  // Called when app is already running and a new intent arrives
  override fun onNewIntent(intent: Intent?) {
    super.onNewIntent(intent)
    setIntent(intent)
    handleIntent(intent)
  }

  private fun handleIntent(intent: Intent?) {
    if (intent == null) return
    
    // Get the action from the intent
    val action = intent.getStringExtra("pressAction")
    val callUUID = intent.getStringExtra("callUUID")
    
    println("MainActivity - handleIntent: action=$action, callUUID=$callUUID")
    
    // Pass the intent to React Native
    try {
      val reactInstanceManager = reactNativeHost?.reactInstanceManager
      if (reactInstanceManager?.hasStartedCreatingInitialContext() == true) {
        reactInstanceManager.onNewIntent(intent)
      }
    } catch (e: Exception) {
      println("Error passing intent to React Native: ${e.message}")
    }
  }

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}