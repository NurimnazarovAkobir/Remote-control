Add-Type -AssemblyName System.Drawing

function Generate-Photo1 {
    $bmp = New-Object System.Drawing.Bitmap(800, 1200)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

    # Overcast Sky
    $skyBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.Point(0,0)), (New-Object System.Drawing.Point(0,500)),
        [System.Drawing.Color]::FromArgb(255, 175, 185, 192),
        [System.Drawing.Color]::FromArgb(255, 215, 222, 228)
    )
    $g.FillRectangle($skyBrush, 0, 0, 800, 500)

    # Distant Mountains & Water
    $mtnBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.Point(0,400)), (New-Object System.Drawing.Point(0,550)),
        [System.Drawing.Color]::FromArgb(255, 130, 150, 140),
        [System.Drawing.Color]::FromArgb(255, 90, 115, 100)
    )
    $g.FillRectangle($mtnBrush, 0, 400, 800, 150)

    $waterBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(180, 180, 200, 205))
    $g.FillRectangle($waterBrush, 0, 490, 800, 45)

    # Green Hills & Trees
    $hillBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.Point(0,520)), (New-Object System.Drawing.Point(0,1200)),
        [System.Drawing.Color]::FromArgb(255, 65, 120, 50),
        [System.Drawing.Color]::FromArgb(255, 25, 70, 22)
    )
    $g.FillRectangle($hillBrush, 0, 520, 800, 680)

    # Tree clusters
    $treeBrush1 = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 45, 95, 35))
    $treeBrush2 = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 35, 75, 25))
    $g.FillEllipse($treeBrush1, 200, 440, 260, 190)
    $g.FillEllipse($treeBrush2, 400, 430, 320, 210)
    $g.FillEllipse($treeBrush1, 600, 450, 260, 180)

    # Grass texture
    $rand = New-Object System.Random
    $grassPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 95, 160, 65), 3)
    for ($i = 0; $i -lt 250; $i++) {
        $x = $rand.Next(0, 800)
        $y = $rand.Next(650, 1180)
        $h = $rand.Next(40, 130)
        $dx = $rand.Next(-15, 15)
        $g.DrawLine($grassPen, $x, $y, $x + $dx, $y - $h)
    }

    # Man in Grey Blazer standing & looking up right
    $pantsBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 35, 40, 42))
    $g.FillRectangle($pantsBrush, 525, 760, 75, 280)

    $blazerBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.Point(480,600)), (New-Object System.Drawing.Point(590,780)),
        [System.Drawing.Color]::FromArgb(255, 105, 110, 115),
        [System.Drawing.Color]::FromArgb(255, 60, 65, 68)
    )
    $g.FillRectangle($blazerBrush, 485, 600, 115, 180)

    $shirtBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 40, 45, 50))
    $g.FillRectangle($shirtBrush, 515, 600, 40, 110)

    $skinBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 218, 178, 158))
    $g.FillEllipse($skinBrush, 520, 525, 55, 65)

    $hairBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 25, 25, 25))
    $g.FillEllipse($hairBrush, 515, 520, 50, 38)

    $bmp.Save('E:/remote-locator/public/photos/1.jpg', [System.Drawing.Imaging.ImageFormat]::Jpeg)
    $bmp.Dispose()
}

function Generate-Photo2 {
    $bmp = New-Object System.Drawing.Bitmap(800, 800)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

    # Clear Blue Sky
    $skyBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.Point(0,0)), (New-Object System.Drawing.Point(0,350)),
        [System.Drawing.Color]::FromArgb(255, 80, 170, 235),
        [System.Drawing.Color]::FromArgb(255, 180, 225, 245)
    )
    $g.FillRectangle($skyBrush, 0, 0, 800, 350)

    # Snowy Peaks
    $snowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 245, 250, 255))
    $mtnBaseBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 140, 160, 175))

    $g.FillPolygon($mtnBaseBrush, @((New-Object System.Drawing.Point(0,300)), (New-Object System.Drawing.Point(180,140)), (New-Object System.Drawing.Point(350,300))))
    $g.FillPolygon($snowBrush, @((New-Object System.Drawing.Point(180,140)), (New-Object System.Drawing.Point(220,180)), (New-Object System.Drawing.Point(140,200))))

    $g.FillPolygon($mtnBaseBrush, @((New-Object System.Drawing.Point(220,300)), (New-Object System.Drawing.Point(450,110)), (New-Object System.Drawing.Point(680,300))))
    $g.FillPolygon($snowBrush, @((New-Object System.Drawing.Point(450,110)), (New-Object System.Drawing.Point(500,170)), (New-Object System.Drawing.Point(410,190))))

    # Charvak Turquoise Reservoir
    $waterBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.Point(0,320)), (New-Object System.Drawing.Point(0,500)),
        [System.Drawing.Color]::FromArgb(255, 0, 185, 205),
        [System.Drawing.Color]::FromArgb(255, 0, 120, 145)
    )
    $g.FillRectangle($waterBrush, 0, 320, 800, 180)

    # Brown Earth Shoreline
    $earthBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.Point(0,480)), (New-Object System.Drawing.Point(0,800)),
        [System.Drawing.Color]::FromArgb(255, 145, 105, 85),
        [System.Drawing.Color]::FromArgb(255, 95, 65, 50)
    )
    $g.FillRectangle($earthBrush, 0, 480, 800, 320)

    # Man in Black Coat & Flat Cap & Sunglasses
    $coatBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.Point(100,200)), (New-Object System.Drawing.Point(300,750)),
        [System.Drawing.Color]::FromArgb(255, 30, 32, 35),
        [System.Drawing.Color]::FromArgb(255, 15, 15, 18)
    )
    $g.FillRectangle($coatBrush, 100, 220, 240, 450)

    $pantsBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 30, 30, 30))
    $g.FillRectangle($pantsBrush, 140, 650, 150, 130)

    # Face & Neck
    $skinBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 218, 178, 158))
    $g.FillEllipse($skinBrush, 210, 145, 70, 85)

    # Flat Cap (Newsboy Cap)
    $capBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 50, 55, 60))
    $g.FillEllipse($capBrush, 200, 130, 85, 45)

    # Sunglasses
    $glassesBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 20, 35, 65))
    $g.FillRectangle($glassesBrush, 245, 170, 38, 20)

    $bmp.Save('E:/remote-locator/public/photos/2.jpg', [System.Drawing.Imaging.ImageFormat]::Jpeg)
    $bmp.Dispose()
}

function Generate-Photo3 {
    $bmp = New-Object System.Drawing.Bitmap(800, 1200)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

    # Blue Sky
    $skyBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.Point(0,0)), (New-Object System.Drawing.Point(0,400)),
        [System.Drawing.Color]::FromArgb(255, 75, 165, 235),
        [System.Drawing.Color]::FromArgb(255, 175, 220, 245)
    )
    $g.FillRectangle($skyBrush, 0, 0, 800, 450)

    # Green Mountain Slopes
    $mtnBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.Point(0,350)), (New-Object System.Drawing.Point(0,700)),
        [System.Drawing.Color]::FromArgb(255, 65, 135, 60),
        [System.Drawing.Color]::FromArgb(255, 25, 75, 25)
    )
    $g.FillRectangle($mtnBrush, 0, 350, 800, 350)

    # River / Valley
    $riverBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 130, 185, 200))
    $g.FillRectangle($riverBrush, 0, 620, 800, 100)

    # Man Selfie close-up
    # Nike Dark T-Shirt
    $shirtBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 40, 52, 60))
    $g.FillRectangle($shirtBrush, 80, 720, 640, 480)

    # Nike Swoosh Logo
    $whitePen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, 5)
    $g.DrawArc($whitePen, 220, 820, 60, 30, 180, -120)

    # Neck & Face
    $skinBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 220, 180, 160))
    $g.FillEllipse($skinBrush, 260, 400, 280, 340)

    # Short Hair
    $hairBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 25, 25, 25))
    $g.FillEllipse($hairBrush, 265, 380, 270, 120)

    # Rimless Metallic Glasses
    $glassPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 160, 175, 185), 4)
    $g.DrawRectangle($glassPen, 310, 520, 80, 45)
    $g.DrawRectangle($glassPen, 410, 520, 80, 45)
    $g.DrawLine($glassPen, 390, 540, 410, 540)

    # Eyes
    $eyeBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 55, 40, 35))
    $g.FillEllipse($eyeBrush, 335, 535, 30, 18)
    $g.FillEllipse($eyeBrush, 435, 535, 30, 18)

    $bmp.Save('E:/remote-locator/public/photos/3.jpg', [System.Drawing.Imaging.ImageFormat]::Jpeg)
    $bmp.Dispose()
}

function Generate-Photo4 {
    $bmp = New-Object System.Drawing.Bitmap(800, 800)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

    # Night Sky & Ground
    $nightBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.Point(0,0)), (New-Object System.Drawing.Point(0,800)),
        [System.Drawing.Color]::FromArgb(255, 12, 18, 30),
        [System.Drawing.Color]::FromArgb(255, 30, 40, 55)
    )
    $g.FillRectangle($nightBrush, 0, 0, 800, 800)

    # Spotlight Glow
    $glowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(80, 255, 250, 220))
    $g.FillEllipse($glowBrush, 100, 40, 400, 400)

    # White Sedan Car (Daewoo Nexia)
    $carBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 235, 240, 245))
    $g.FillRectangle($carBrush, 20, 450, 720, 180)

    # Wheels
    $wheelBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 20, 25, 30))
    $g.FillEllipse($wheelBrush, 100, 570, 110, 110)
    $g.FillEllipse($wheelBrush, 550, 570, 110, 110)

    # Headlight
    $lightBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 245, 200))
    $g.FillEllipse($lightBrush, 30, 480, 40, 30)

    # Man leaning on car
    $tshirtBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 30, 40, 50))
    $g.FillRectangle($tshirtBrush, 520, 250, 150, 200)

    $jeansBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 55, 125, 225))
    $g.FillRectangle($jeansBrush, 540, 450, 130, 270)

    $skinBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 218, 178, 158))
    $g.FillEllipse($skinBrush, 555, 175, 75, 85)

    $hairBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 25, 25, 25))
    $g.FillEllipse($hairBrush, 550, 168, 70, 40)

    $bmp.Save('E:/remote-locator/public/photos/4.jpg', [System.Drawing.Imaging.ImageFormat]::Jpeg)
    $bmp.Dispose()
}

Generate-Photo1
Generate-Photo2
Generate-Photo3
Generate-Photo4
Write-Host "Photos generated successfully."
