# Linux access

The desktop editor uses the AgentPad13 Vial HID collection. If your account
cannot open the pad, install the included scoped udev rule once:

~~~sh
sudo install -m 644 packaging/99-agentpad13-vial.rules /etc/udev/rules.d/99-agentpad13-vial.rules
sudo udevadm control --reload-rules
sudo udevadm trigger --subsystem-match=hidraw
~~~

Unplug and reconnect the pad afterwards. The rule is deliberately limited to
USB VID `303a` and PID `8360`; it does not grant broad access to HID devices.

To remove the rule later, delete
`/etc/udev/rules.d/99-agentpad13-vial.rules`, reload udev rules, and reconnect
the device.
