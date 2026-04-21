const express = require('express');
const path = require('path');
const { 
    Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, 
    PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
    ModalBuilder, TextInputBuilder, TextInputStyle 
} = require('discord.js');

const app = express();
app.use(express.json());

const client = new Client({ intents: [3276799] });

async function registrarComandos(token, clientId) {
    const commands = [
        new SlashCommandBuilder()
            .setName('config-venda')
            .setDescription('Cria um painel de vendas personalizado')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    ].map(c => c.toJSON());

    const rest = new REST({ version: '10' }).setToken(token);
    try {
        await rest.put(Routes.applicationCommands(clientId), { body: commands });
    } catch (e) { console.error(e); }
}

async function iniciarBot(token) {
    client.on('ready', async () => {
        console.log(`✅ Sistema Sirius Online: ${client.user.tag}`);
    });

    client.on('interactionCreate', async (i) => {
        // 1. CRIAR CARGO VENDEDOR CASO NÃO EXISTA
        let cargoVendedor = i.guild.roles.cache.find(r => r.name === 'Vendedor Sirius');
        if (!cargoVendedor) {
            cargoVendedor = await i.guild.roles.create({
                name: 'Vendedor Sirius',
                color: '#00ff6a',
                reason: 'Cargo necessário para gerenciar vendas'
            });
        }

        // 2. CONFIGURAÇÃO DO PAINEL (MODAL)
        if (i.isChatInputCommand() && i.commandName === 'config-venda') {
            const modal = new ModalBuilder().setCustomId('m_venda').setTitle('Configurar Produto Sirius');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('t').setLabel('Título').setStyle(TextInputStyle.Short)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('d').setLabel('Descrição/Siglas').setStyle(TextInputStyle.Paragraph)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('v').setLabel('Valor R$').setStyle(TextInputStyle.Short)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('i').setLabel('URL da Imagem (Banner)').setStyle(TextInputStyle.Short)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('e').setLabel('Estoque Inicial').setStyle(TextInputStyle.Short))
            );
            return await i.showModal(modal);
        }

        // 3. POSTAR PAINEL
        if (i.isModalSubmit() && i.customId === 'm_venda') {
            const [t, d, v, img, e] = ['t', 'd', 'v', 'i', 'e'].map(f => i.fields.getTextInputValue(f));
            const embed = new EmbedBuilder()
                .setTitle(t).setDescription(d).setImage(img).setColor("#00ff6a")
                .addFields({ name: '💰 Preço', value: `R$ ${v}`, inline: true }, { name: '📦 Estoque', value: `${e}`, inline: true });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`opcoes_${t}_${v}`).setLabel('Ver Opções').setStyle(ButtonStyle.Success)
            );
            await i.channel.send({ embeds: [embed], components: [row] });
            return i.reply({ content: "✅ Painel postado!", ephemeral: true });
        }

        // 4. ABRIR CARRINHO (SÓ CLIENTE E VENDEDOR VEEM)
        if (i.isButton() && i.customId.startsWith('opcoes_')) {
            const [_, nome, preco] = i.customId.split('_');
            const canal = await i.guild.channels.create({
                name: `🛒-${i.user.username}`,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    { id: i.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                    { id: cargoVendedor.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                ]
            });

            const emb = new EmbedBuilder()
                .setTitle("Revisão do Pedido").setDescription(`**Produto:** ${nome}\n**Valor:** R$ ${preco}`)
                .setColor("#5865F2").setThumbnail(i.message.embeds[0].image?.url);

            const btns = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`pix_${preco}`).setLabel('Ir para o Pagamento').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('cancelar').setLabel('Cancelar').setStyle(ButtonStyle.Danger)
            );

            await canal.send({ content: `${i.user} | Suporte: <@&${cargoVendedor.id}>`, embeds: [emb], components: [btns] });
            await i.reply({ content: `Carrinho aberto: ${canal}`, ephemeral: true });
        }

        // 5. PARTE DO PIX COM TIMER DE 10 MINUTOS
        if (i.isButton() && i.customId.startsWith('pix_')) {
            const valor = i.customId.split('_')[1];
            const pixEmbed = new EmbedBuilder()
                .setTitle("Pagamento via PIX")
                .setDescription(`Efetue o pagamento de **R$ ${valor}** na chave abaixo:\n\n\`SUA-CHAVE-PIX-AQUI\`\n\n⌛ **Você tem 10 minutos para pagar.**`)
                .setFooter({ text: "Aguardando confirmação do vendedor..." }).setColor("#00ff6a");

            const btnConfirma = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('confirmar_pago').setLabel('Confirmar Pagamento (Vendedor)').setStyle(ButtonStyle.Primary)
            );

            await i.update({ embeds: [pixEmbed], components: [btnConfirma] });

            // Timer de 10 minutos (600000ms)
            setTimeout(async () => {
                const fetchedChannel = await i.guild.channels.fetch(i.channelId).catch(() => null);
                if (fetchedChannel) {
                    await fetchedChannel.send("⚠️ Tempo esgotado! O carrinho será fechado em 5 segundos.");
                    setTimeout(() => fetchedChannel.delete().catch(() => {}), 5000);
                }
            }, 600000);
        }

        // 6. CONFIRMAÇÃO DO VENDEDOR
        if (i.isButton() && i.customId === 'confirmar_pago') {
            if (!i.member.roles.cache.has(cargoVendedor.id)) {
                return i.reply({ content: "❌ Apenas vendedores podem confirmar o pagamento!", ephemeral: true });
            }
            await i.reply("✅ **Pagamento Confirmado!** O produto será entregue em breve.");
            // Aqui você pode adicionar a lógica de entrega automática
        }

        if (i.isButton() && i.customId === 'cancelar') {
            await i.channel.delete().catch(() => {});
        }
    });

    await client.login(token);
    await registrarComandos(token, client.user.id);
}

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.post('/ligar-bot', async (req, res) => {
    try { await iniciarBot(req.body.token); res.send({ msg: "OK" }); } 
    catch (e) { res.send({ msg: "ERRO" }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Servidor rodando na porta ${PORT}`));
